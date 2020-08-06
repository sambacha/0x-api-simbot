'use strict'
require('colors');
const AbiEncoder = require('web3-eth-abi');
const BigNumber = require('bignumber.js');
const process = require('process');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const ethjs = require('ethereumjs-util');

const {
    delay,
    loadConfig,
    randomAddress,
    toHex,
    toTokenAmount,
} = require('./utils');
const {
    eth,
    loadArtifact,
    createContractFromArtifact,
    createContractFromArtifactPath,
} = require('./web3');
const TOKENS = require('./tokens');
const CONFIG = loadConfig();

const ERC20_PROXY = CONFIG.erc20Proxy;
const EXCHANGE = CONFIG.exchange;
const ARTIFACTS = {
    MarketCallTaker: loadArtifact(`build/MarketCallTaker.output.json`),
    HackedWallet: loadArtifact(`build/HackedWallet.output.json`),
    TransformerDeployer: loadArtifact(`build/TransformerDeployer.output.json`),
    NoGST: loadArtifact(`build/NoGST.output.json`),
}
const takerContract = createContractFromArtifact(
    ARTIFACTS.MarketCallTaker,
    CONFIG.taker,
);
const transformerDeployer = createContractFromArtifact(
    ARTIFACTS.TransformerDeployer,
    CONFIG.transformers.deployer,
);

// Track the block number at which a quote is being filled.
// A-B fills can reach into this cache to synchronize the blocks at which
// they fill so they fill against the same state.
const FILL_BLOCK_NUMBER_BY_QUOTE_ID_CACHE = {};

async function fillSellQuote(opts) {
    const { makerToken, takerToken, swapValue, apiPath, apiPathId, fillDelay, id } = opts;
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
            apiURL: apiPathId,
            side: 'sell',
            fillAmount: takerTokenAmount.toString(10),
            fillValue: swapValue,
            timestamp: Math.floor(quoteTime / 1000),
            responseTime: (Date.now() - quoteTime) / 1000,
            fillDelay: fillDelay,
            maxSellAmount: quoteResult.sellAmount,
            ethPrice: TOKENS['ETH'].price,
            sellTokenPrice: TOKENS[takerToken].price,
            buyTokenPrice: TOKENS[makerToken].price,
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
    const { makerToken, takerToken, swapValue, apiPath, apiPathId, fillDelay, id } = opts;
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
            apiURL: apiPathId,
            side: 'buy',
            fillAmount: makerTokenAmount.toString(10),
            fillValue: swapValue,
            timestamp: Math.floor(quoteTime / 1000),
            responseTime: (Date.now() - quoteTime) / 1000,
            fillDelay: fillDelay,
            maxSellAmount: getBuyQuoteMaxSellAmount(quoteResult),
            ethPrice: TOKENS['ETH'].price,
            sellTokenPrice: TOKENS[takerToken].price,
            buyTokenPrice: TOKENS[makerToken].price,
        }
    };
    if (quote.data) {
        return delay(
            async () => fillQuote(quote),
            quote.metadata.fillDelay * 1000,
        );
    }
}

function getBuyQuoteMaxSellAmount(quoteResult) {
    const selector = quoteResult.data.slice(0, 10);;
    if (selector === '0x415565b0') {
        // Exchange proxy `transformERC20()`
        return new BigNumber(
            ethjs.bufferToHex(
                ethjs.toBuffer(quoteResult.data).slice(68, 100),
            ),
        ).toString(10);
    }
    return BigNumber
        .sum(...quoteResult.orders.map(o => o.takerAssetAmount))
        .toString(10);
}

async function fillQuote(quote) {
    const {
        id,
        side,
        makerToken,
        takerToken,
        fillAmount,
        fillDelay,
        fillValue,
        maxSellAmount,
    } = quote.metadata;
    const transformers = await getTransformersOverrides();
    const overrides = await getOverrides();
    // Synchronize fill block numbers across quotes under the same id.
    let blockNumber = FILL_BLOCK_NUMBER_BY_QUOTE_ID_CACHE[id]
        ? FILL_BLOCK_NUMBER_BY_QUOTE_ID_CACHE[id]
        : await eth.getBlockNumber();
    FILL_BLOCK_NUMBER_BY_QUOTE_ID_CACHE[id] = blockNumber;
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
            transformerDeployer: transformerDeployer.address,
            transformersDeployData: transformers.map(({deployData}) => deployData),
        }).call({
            block: blockNumber,
            gas: 20e6,
            gasPrice: quote.gasPrice,
            value: quote.value,
            from: TOKENS['ETH'].wallet,
            overrides: {
                [takerContract.address]: { code: ARTIFACTS.MarketCallTaker.deployedBytecode },
                [TOKENS[takerToken].wallet]: { code: ARTIFACTS.HackedWallet.deployedBytecode },
                [config.gst]: { code: ARTIFACTS.NoGST.deployedBytecode },
                ...(transformers.length > 0
                    ? {
                        [transformerDeployer.address]: {
                            code: ARTIFACTS.TransformerDeployer.deployedBytecode,
                            nonce: transformers[0].deploymentNonce,
                        },
                        // Reset state for transformers to be re-deployed.
                        ...(_.zipObject(
                            transformers.map(({address}) => address),
                            transformers.map(t => ({
                                code: '0x',
                                nonce: 0,
                                balance: t.balance,
                            })),
                        )),
                    } : {}
                ),
                ...overrides,
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

async function getTransformersOverrides() {
    const overrides = _.get(CONFIG, ['transformers', 'overridesByNonce'], {});
    const transformers = [];
    for (const nonce of Object.keys(overrides).map(k => parseInt(k))) {
        const override = overrides[nonce];
        transformers.push({
            deploymentNonce: nonce,
            deployData: await createContractFromArtifactPath(override.artifactPath)
                .new(...(override.constructorArgs || [])).encode(),
            address: toTransformerAddress(CONFIG.transformers.deployer, nonce),
            balance: override.balance,
        });
    }
    return transformers.sort((a, b) => a.deploymentNonce - b.deploymentNonce);
}

async function getOverrides() {
    return _.mapValues(
        _.get(CONFIG, ['overrides'], {}),
        ({ artifactPath, balance, nonce }) => ({
            code: loadArtifact(artifactPath).deployedBytecode,
            balance: balance,
            nonce: nonce,
        }),
    );
}

function toTransformerAddress(deployer, nonce) {
    return ethjs.bufferToHex(ethjs.rlphash([deployer, nonce]).slice(12));
}

function printFillSummary(quote, success, revertData) {
    const { side, makerToken, takerToken, fillDelay, fillValue } = quote.metadata;
    let { sellAmount, buyAmount } = quote;
    sellAmount = new BigNumber(sellAmount).div(10 ** TOKENS[takerToken].decimals).toFixed(2);
    buyAmount = new BigNumber(buyAmount).div(10 ** TOKENS[makerToken].decimals).toFixed(2);
    const summary = `${side.toUpperCase()} ${takerToken.bold}->${makerToken.bold} ${sellAmount.yellow} -> ${buyAmount.yellow} ($${fillValue.toFixed(2)}) after ${fillDelay.toFixed(1)}s`;
    let composition = quote.sources
        .map(s => `${s.name}: ${s.proportion * 100}%`)
        .join(', ');
    if (doesQuoteHaveFallback(quote)) {
        composition = `${composition} (+ fallback)`;
    }
    if (success) {
        console.log(`${summary} @ ${quote.metadata.apiURL.bold}\n\t${'✔ PASS'.green.bold}\n\t${composition}`);
    } else {
        console.log(`${summary} @ ${quote.metadata.apiURL.bold}\n\t${'✘ FAIL'.red.bold} (${revertData})\n\t${composition}`);
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
        gasUsed: parseInt(result.gasStart) - parseInt(result.gasEnd),
        blockNumber: parseInt(result.blockNumber),
        revertData: result.revertData,
        boughtAmount: result.boughtAmount,
        soldAmount: result.soldAmount,
        ethBalance: result.ethBalance,
    };
}

module.exports = {
    fillSellQuote,
    fillBuyQuote,
};
