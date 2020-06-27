'use strict'
require('colors');
const FlexContract = require('flex-contract');
const FlexEther = require('flex-ether');
const AbiEncoder = require('web3-eth-abi');
const BigNumber = require('bignumber.js');
const process = require('process');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const ethjs = require('ethereumjs-util');

const { delay, randomAddress, toHex, toTokenAmount } = require('./utils');
const TOKENS = require('./tokens');

const ERC20_PROXY = '0x95e6f48254609a6ee006f7d493c8e5fb97094cef';
const EXCHANGE = '0x61935cbdd02287b511119ddb11aeb42f1593b7ef';
const BUILD_ROOT = path.resolve(__dirname, '../build');
const ARTIFACTS = {
    MarketCallTaker: JSON.parse(fs.readFileSync(`${BUILD_ROOT}/MarketCallTaker.output.json`)),
    HackedWallet: JSON.parse(fs.readFileSync(`${BUILD_ROOT}/HackedWallet.output.json`)),
    TransformerDeployer: JSON.parse(fs.readFileSync(`${BUILD_ROOT}/TransformerDeployer.output.json`)),
}

const eth = new FlexEther({ providerURI: process.env.NODE_RPC });
const takerContract = new FlexContract(ARTIFACTS.MarketCallTaker.abi, randomAddress(), { eth });
const transformerDeployer = new FlexContract(ARTIFACTS.TransformerDeployer.abi, '0x80a36559ab9a497fb658325ed771a584eb0f13da', { eth });

async function getExchangeProxyArtifact(artifactName) {
    const [pkgName, contractName] = artifactName.split('/');
    return JSON.parse(await fs.promises.readFile(
        // CHANGE THIS TO YOUR MONOREPO PATH, and compile (no need to build) those packages.
        `../0x-monorepo/contracts/${pkgName}/test/generated-artifacts/${contractName}.json`,
    ));
}

async function getExchangeProxyContract(artifactName, address) {
    const [pkgName, contractName] = artifactName.split('/');
    const artifact = await getExchangeProxyArtifact(artifactName);
    const abi = artifact.compilerOutput.abi;
    const bytecode = artifact.compilerOutput.evm.bytecode.object;
    return new FlexContract(abi, address, { eth, bytecode });
}

async function fillSellQuote(opts) {
    const { makerToken, takerToken, swapValue, apiPath, fillDelay, id } = opts;
    const quoteTime = Date.now();
    const takerTokenAmount =
        toTokenAmount(takerToken, new BigNumber(swapValue).div(TOKENS[takerToken].value));
    const qs = [
        ...(/(?:\?(.+))?$/.exec(apiPath)[1] || '').split('&'),
        `buyToken=${makerToken}`,
        `sellToken=${takerToken}`,
        `sellAmount=${takerTokenAmount.toString(10)}`,
    ].join('&');
    const url = `${/^(.+?)(\?.+)?$/.exec(apiPath)[1]}?${qs}`;
    const resp = await fetch(url);
    const quoteResult = await resp.json();
    const quote = {
        ...quoteResult,
        // Filter out unused sources.
        sources: quoteResult.sources.filter(s => s.proportion !== '0'),
        metadata: {
            id,
            makerToken,
            takerToken,
            apiPath,
            side: 'sell',
            fillAmount: takerTokenAmount.toString(10),
            fillValue: swapValue,
            timestamp: Math.floor(quoteTime / 1000),
            responseTime: (Date.now() - quoteTime) / 1000,
            fillDelay: fillDelay,
            maxSellAmount: quoteResult.sellAmount,
        }
    };
    if (quote.data) {
        return delay(
            async () => fillQuote(quote),
            quote.metadata.fillDelay * 1000,
        );
    }
}

async function fillBuyQuote(opts) {
    const { makerToken, takerToken, swapValue, apiPath, fillDelay, id } = opts;
    const quoteTime = Date.now();
    const makerTokenAmount =
        toTokenAmount(makerToken, new BigNumber(swapValue).div(TOKENS[makerToken].value));
    const qs = [
        ...(/(?:\?(.+))?$/.exec(apiPath)[1] || '').split('&'),
        `buyToken=${makerToken}`,
        `sellToken=${takerToken}`,
        `buyAmount=${makerTokenAmount.toString(10)}`,
    ].join('&');
    const url = `${/^(.+?)(\?.+)?$/.exec(apiPath)[1]}?${qs}`;
    const resp = await fetch(url);
    const quoteResult = await resp.json();
    const quote = {
        ...quoteResult,
        // Filter out unused sources.
        sources: quoteResult.sources.filter(s => s.proportion !== '0'),
        metadata: {
            id,
            makerToken,
            takerToken,
            apiPath,
            side: 'buy',
            fillAmount: makerTokenAmount.toString(10),
            fillValue: swapValue,
            timestamp: Math.floor(quoteTime / 1000),
            responseTime: (Date.now() - quoteTime) / 1000,
            fillDelay: fillDelay,
            maxSellAmount: getBuyQuoteMaxSellAmount(quoteResult),
        }
    };
    if (quoteResult.data.startsWith('0x415565b0')) {
        quote.data = ethjs.bufferToHex(Buffer.concat([
            ethjs.toBuffer(quote.data).slice(0, 68),
            ethjs.setLengthLeft('0x'+new BigNumber(quote.metadata.maxSellAmount).toString(16), 32),
            ethjs.toBuffer(quote.data).slice(100),
        ]));
    }

    if (quote.data) {
        return delay(
            async () => fillQuote(quote),
            quote.metadata.fillDelay * 1000,
        );
    }
}

function getBuyQuoteMaxSellAmount(quoteResult) {
    if (quoteResult.data.startsWith('0x415565b0')) {
        // Exchange proxy `transformERC20()`
        return new BigNumber(
            ethjs.bufferToHex(
                ethjs.toBuffer(quoteResult.data).slice(68, 100),
            ),
        ).times(2).toString(10);
    }
    return BigNumber.sum(...quoteResult.orders.map(o => o.takerAssetAmount))
        .toString(2);
}

async function fillQuote(quote) {
    const {
        side,
        makerToken,
        takerToken,
        fillAmount,
        fillDelay,
        fillValue,
        maxSellAmount,
    } = quote.metadata;
    try {
        const result = normalizeSwapResult(await takerContract.fill({
            to: quote.to,
            makerToken: TOKENS[makerToken].address,
            takerToken: TOKENS[takerToken].address,
            wallet: TOKENS[takerToken].wallet,
            spender: quote.allowanceTarget || ERC20_PROXY,
            exchange: EXCHANGE,
            data: quote.data,
            orders: quote.orders,
            protocolFeeAmount: quote.protocolFee,
            sellAmount: maxSellAmount,
            deployer: transformerDeployer.address,
            deployerData: await (await getExchangeProxyContract('zero-ex/FillQuoteTransformer')).new(EXCHANGE).encode(),
        }).call({
            gas: 20e6,
            gasPrice: quote.gasPrice,
            value: quote.value,
            from: TOKENS['ETH'].wallet,
            overrides: {
                [takerContract.address]: { code: '0x' + ARTIFACTS.MarketCallTaker.deployedBytecode },
                [TOKENS[takerToken].wallet]: { code: '0x' + ARTIFACTS.HackedWallet.deployedBytecode },
                [transformerDeployer.address]: {
                    code: '0x' + ARTIFACTS.TransformerDeployer.deployedBytecode,
                    nonce: 3,
                },
                ['0x9b81a08ef144e7aa4925f7fd77da1e1b3990e59a']: {
                    code: '0x',
                    nonce: 0,
                },
                '0x5591360f8c7640fea5771c9682d6b5ecb776e1f8': {
                    code: (await getExchangeProxyArtifact(
                        'asset-proxy/DexForwarderBridge',
                    )).compilerOutput.evm.deployedBytecode.object,
                },
            },
        }));
        let success = result.revertData === '0x' &&
            new BigNumber(result.boughtAmount).gt(0);
        printFillSummary(quote, success, result.revertData);
        return {
            ...quote,
            metadata: {
                ...quote.metadata,
                swapResult: result,
            },
        };
    } catch (err) {
        console.error(`${takerToken} -> ${makerToken}`, err);
    }
}

function printFillSummary(quote, success, revertData) {
    const { side, makerToken, takerToken, fillAmount, fillDelay, fillValue } = quote.metadata;
    const fillSize = side === 'sell'
        ? new BigNumber(fillAmount).div(10 ** TOKENS[takerToken].decimals).toFixed(2)
        : new BigNumber(fillAmount).div(10 ** TOKENS[makerToken].decimals).toFixed(2);
    const summary = `${side.toUpperCase()} ${takerToken.bold}->${makerToken.bold} ${fillSize.yellow} ($${fillValue.toFixed(2)}) after ${fillDelay.toFixed(1)}s`;
    let composition = quote.sources
        .map(s => `${s.name}: ${s.proportion * 100}%`)
        .join(', ');
    if (doesQuoteHaveFallback(quote)) {
        composition = `${composition} (+ fallback)`;
    }
    if (success) {
        console.log(`${summary} @ ${quote.metadata.apiPath}\n\t${'✔ PASS'.green.bold}\n\t${composition}`);
    } else {
        console.log(`${summary} @ ${quote.metadata.apiPath}\n\t${'✘ FAIL'.red.bold} (${revertData})\n\t${composition}`);
    }
}

function doesQuoteHaveFallback(quote) {
    const nativeOrders = quote.orders.filter(o => /^0xf47261b0/.test(o.makerAssetData));
    if (nativeOrders.length == 0) {
        return false;
    }
    const bridgeOrders = quote.orders.filter(o => !/^0xf47261b0/.test(o.makerAssetData));
    if (quote.metadata.side === 'sell') {
        const totalBridgesTakerAssetAmount = BigNumber.sum(...bridgeOrders.map(o => o.takerAssetAmount));
        return totalBridgesTakerAssetAmount.gte(quote.sellAmount);
    } else {
        const totalBridgesMakerAssetAmount = BigNumber.sum(...bridgeOrders.map(o => o.makerAssetAmount));
        return totalBridgesMakerAssetAmount.gte(quote.buyAmount);
    }
}

function normalizeSwapResult(result) {
    return {
        ...result,
        gasUsed: parseInt(result.gasStart) - parseInt(result.gasEnd),
        blockNumber: parseInt(result.blockNumber),
        revertData: result.revertData,
        boughtAmount: result.boughtAmount,
        soldAmount: result.soldAmount,
        orderInfos: result.orderInfos.map(info => ({
            orderHash: info.orderHash,
            orderStatus: parseInt(info.orderStatus),
            orderTakerAssetFilledAmount: info.orderTakerAssetFilledAmount,
        })),
    };
}

module.exports = {
    fillSellQuote,
    fillBuyQuote,
};
