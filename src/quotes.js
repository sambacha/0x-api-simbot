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

const zeroEx = require('./quote_sources/zero_ex');
const oneInch = require('./quote_sources/one_inch');
const { delay, loadConfig, randomAddress, toHex, toTokenAmount } = require('./utils');
const {
    eth,
    loadArtifact,
    createContractFromArtifact,
    createContractFromArtifactPath,
} = require('./web3');
const TOKENS = require('./tokens');
const CONFIG = loadConfig();

const GST_ADDRESS = '0x0000000000b3F879cb30FE243b4Dfee438691c04';
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

async function fillSellQuote(opts) {
    let quote;
    if (opts.apiPath.includes('1inch')) {
        quote = await oneInch.getSellQuote(opts);
    } else {
        quote = await zeroEx.getSellQuote(opts);
    }
    if (quote && quote.data) {
        return delay(
            async () => fillQuote(quote),
            quote.metadata.fillDelay * 1000,
        );
    } else {
        await delay(() => {}, 10000);
    }
}

async function fillBuyQuote(opts) {
    const quote = await zeroEx.getSellQuote(opts);
    if (quote && quote.data) {
        return delay(
            async () => fillQuote(quote),
            quote.metadata.fillDelay * 1000,
        );
    }
}

async function fillQuote(quote) {
    const {
        makerToken,
        takerToken,
        maxSellAmount,
    } = quote.metadata;
    const transformers = await getTransformersOverrides();
    const overrides = await getOverrides();
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
            gas: 20e6,
            gasPrice: quote.gasPrice,
            value: quote.value,
            from: TOKENS['ETH'].wallet,
            overrides: {
                [takerContract.address]: { code: ARTIFACTS.MarketCallTaker.deployedBytecode },
                [TOKENS[takerToken].wallet]: { code: ARTIFACTS.HackedWallet.deployedBytecode },
                [GST_ADDRESS]: { code: ARTIFACTS.NoGST.deployedBytecode },
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
