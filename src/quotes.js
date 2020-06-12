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
    Deployer: JSON.parse(fs.readFileSync(`${BUILD_ROOT}/Deployer.output.json`)),
};
const ZERO_EX_ARTIFACTS = {
    SimpleFunctionRegistry: loadZeroExArtifact('@0x/contracts-zero-ex/test/generated-artifacts/SimpleFunctionRegistry.json'),
    Ownable: loadZeroExArtifact('@0x/contracts-zero-ex/test/generated-artifacts/Ownable.json'),
    TokenSpender: loadZeroExArtifact('@0x/contracts-zero-ex/test/generated-artifacts/TokenSpender.json'),
    TransformERC20: loadZeroExArtifact('@0x/contracts-zero-ex/test/generated-artifacts/TransformERC20.json'),
    WethTransformer: loadZeroExArtifact('@0x/contracts-zero-ex/test/generated-artifacts/WethTransformer.json'),
    PayTakerTransformer: loadZeroExArtifact('@0x/contracts-zero-ex/test/generated-artifacts/PayTakerTransformer.json'),
    FillQuoteTransformer: loadZeroExArtifact('@0x/contracts-zero-ex/test/generated-artifacts/FillQuoteTransformer.json'),
};
const eth = new FlexEther({ providerURI: process.env.NODE_RPC });
const TAKER_CONTRACT_ADDRESS = '0x84b342121bFBF1987e07487129908f9BE6998593';
const takerContract = new FlexContract(ARTIFACTS.MarketCallTaker.abi, TAKER_CONTRACT_ADDRESS, { eth });
const DEPLOYER_CONTRACT_ADDRESS = '0xBD4338F8d97c634AE8bA9f96c55d8138E663C1ca';
const deployerContract = new FlexContract(
    ARTIFACTS.Deployer.abi,
    DEPLOYER_CONTRACT_ADDRESS,
    { eth },
);

function loadZeroExArtifact(artifactPath) {
    const r = JSON.parse(fs.readFileSync(require.resolve(artifactPath)));
    return {
        abi: r.compilerOutput.abi,
        bytecode: r.compilerOutput.evm.bytecode.object,
        deployedBytecode: r.compilerOutput.evm.deployedBytecode.object,
    };
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
        }
    };
    if (quote.data) {
        return delay(
            async () => fillQuote(quote),
            quote.metadata.fillDelay * 1000,
        );
    }
}

const CONTRACT_DEPS = {};

async function createContractDependencies() {
    let nonce = 0;
    const fakeDeploy = async (artifact, ...args)  => {
        let _nonce = nonce++;
        const { deployedAddress, deployedBytecode } = await deployerContract.deploy(
            await new FlexContract(
                artifact.abi,
                { eth, bytecode: artifact.bytecode },
            ).new(...args).encode(),
        ).call({
            overrides: {
                [deployerContract.address]: {
                    code: ethjs.addHexPrefix(ARTIFACTS.Deployer.deployedBytecode),
                    nonce: _nonce,
                },
            },
        });
        return { address: deployedAddress, code: deployedBytecode, nonce: _nonce };
    };
    return Object.assign(CONTRACT_DEPS, {
        features: {
            registry: await fakeDeploy(ZERO_EX_ARTIFACTS.SimpleFunctionRegistry),
            ownable: await fakeDeploy(ZERO_EX_ARTIFACTS.Ownable),
            tokenSpender: await fakeDeploy(ZERO_EX_ARTIFACTS.TokenSpender),
            transformERC20: await fakeDeploy(ZERO_EX_ARTIFACTS.TransformERC20),
        },
        transformers: {
            wethTransformer: await fakeDeploy(ZERO_EX_ARTIFACTS.WethTransformer, TOKENS['WETH'].address),
            payTakerTransformer: await fakeDeploy(ZERO_EX_ARTIFACTS.PayTakerTransformer),
            fillQuoteTransformer: await fakeDeploy(ZERO_EX_ARTIFACTS.FillQuoteTransformer, EXCHANGE),
        },
    });
}

async function fillQuote(quote) {
    if (Object.values(CONTRACT_DEPS).length === 0) {
        console.log(_.mapValues(await createContractDependencies(), v => _.mapValues(v, v => _.omit(v, ['code']))));
    }
    const { side, makerToken, takerToken, fillAmount, fillDelay, fillValue } = quote.metadata;
    const takerContractAddress = randomAddress();
    try {
        const result = normalizeSwapResult(await takerContract.fill({
            to: quote.to,
            makerToken: TOKENS[makerToken].address,
            takerToken: TOKENS[takerToken].address,
            wallet: TOKENS[takerToken].wallet,
            spender: quote.spender || ERC20_PROXY,
            exchange: EXCHANGE,
            data: quote.data,
            orders: quote.orders,
            protocolFeeAmount: quote.protocolFee,
            sellAmount: quote.sellAmount,
            deps: {
                features: _.mapValues(CONTRACT_DEPS.features, v => v.address),
                migrateOpts: { transformerDeployer: deployerContract.address },
            },
        }).call({
            gas: 256e6,
            gasPrice: quote.gasPrice,
            value: quote.value,
            from: TOKENS['ETH'].wallet,
            overrides: {
                [takerContract.address]: { code: '0x' + ARTIFACTS.MarketCallTaker.deployedBytecode },
                [TOKENS[takerToken].wallet]: { code: '0x' + ARTIFACTS.HackedWallet.deployedBytecode },
                ...(_.zipObject(
                    Object.values(CONTRACT_DEPS.features).map(d => d.address),
                    Object.values(CONTRACT_DEPS.features).map(d => ({code: d.code })),
                )),
                ...(_.zipObject(
                    Object.values(CONTRACT_DEPS.transformers).map(d => d.address),
                    Object.values(CONTRACT_DEPS.transformers).map(d => ({code: d.code })),
                )),
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
    const summary = `${takerToken.bold}->${makerToken.bold} ${fillSize.yellow} ($${fillValue.toFixed(2)}) ${side} after ${fillDelay.toFixed(1)}s`;
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
};
