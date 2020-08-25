'use strict';
const { RevertError } = require('@0x/utils');
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
const {
    delay,
    loadConfig,
    randomAddress,
    toHex,
    fromTokenWeis,
    toDeployedAddress,
} = require('./utils');
const {
    eth,
    loadArtifact,
    createContractFromArtifact,
    createContractFromArtifactPath,
} = require('./web3');
const TOKENS = require('./tokens');
const CONFIG = loadConfig();

const ARTIFACTS = {
    MarketCallTaker: loadArtifact(`build/MarketCallTaker.output.json`),
    HackedWallet: loadArtifact(`build/HackedWallet.output.json`),
    TransformerDeployer: loadArtifact(`build/TransformerDeployer.output.json`),
    NoGST: loadArtifact(`build/NoGST.output.json`),
    ContractDeployer: loadArtifact('build/ContractDeployer.output.json'),
};
const takerContract = createContractFromArtifact(
    ARTIFACTS.MarketCallTaker,
    CONFIG.taker
);
const transformerDeployer = createContractFromArtifact(
    ARTIFACTS.TransformerDeployer,
    CONFIG.transformers.deployer
);

// Track the block number at which a quote is being filled.
// A-B fills can reach into this cache to synchronize the blocks at which
// they fill so they fill against the same state.
const FILL_BLOCK_NUMBER_BY_QUOTE_ID_CACHE = {};

const STEP_DIRECTIONS = [0, 0.25, 0.5, 0.75].map((x) => x * 2 * Math.PI);
let stepSize = 0.1;
const STEP_SIZE_DECAY = 0.999;
let sampleDistributionParams = { alpha: 1, beta: 1 };
const MIN_PARAM_VALUE = 0.001;
function stepParams(params, stepSize, direction) {
    return {
        alpha: Math.max(
            MIN_PARAM_VALUE,
            params.alpha + stepSize * Math.cos(direction)
        ),
        beta: Math.max(
            MIN_PARAM_VALUE,
            params.beta + stepSize * Math.sin(direction)
        ),
    };
}

async function fillSellQuote(opts) {
    const steppedParams = [sampleDistributionParams].concat(
        STEP_DIRECTIONS.map((direction) =>
            stepParams(
                sampleDistributionParams,
                stepSize,
                direction
            )
        )
    );
    stepSize *= STEP_SIZE_DECAY;
    const blockNumber = await eth.getBlockNumber();
    const quotes = await Promise.all(
        steppedParams.map(async (params) =>
            zeroEx.getSellQuote({
                ...opts,
                blockNumber,
                sampleDistributionParams: params,
            })
        )
    );

    const bestQuote = quotes.reduce(
        (prev, quote, i) => {
            const buyAmount = new BigNumber(
                _.get(quote, 'buyAmount', new BigNumber(0))
            );
            console.log(JSON.stringify(quote.sources), buyAmount.toString());
            return buyAmount.isGreaterThan(prev.buyAmount) &&
                JSON.stringify(quote.sources) !== JSON.stringify(prev.sources)
                ? {
                      index: i,
                      buyAmount,
                      sources: quote.sources,
                  }
                : prev;
        },
        { index: -1, buyAmount: 0, sources: [] }
    );
    if (bestQuote.index !== -1) {
        sampleDistributionParams = { ...steppedParams[bestQuote.index] };
    }
    console.log(sampleDistributionParams);
    return delay(async () => sampleDistributionParams, 2000);
}

async function fillBuyQuote(opts) {
    if (opts.apiPath.includes('1inch')) {
        throw new Error(`buys not supported on 1inch`);
    }
    const quote = await zeroEx.getBuyQuote(opts);
    if (quote && quote.data) {
        return delay(
            async () => fillQuote(quote),
            quote.metadata.fillDelay * 1000
        );
    }
}

async function fillQuote(quote) {
    const { id, makerToken, takerToken, maxSellAmount } = quote.metadata;
    const transformers = await getTransformersOverrides();
    const overrides = await getOverrides();
    // Synchronize fill block numbers across quotes under the same id.
    let blockNumber = FILL_BLOCK_NUMBER_BY_QUOTE_ID_CACHE[id]
        ? FILL_BLOCK_NUMBER_BY_QUOTE_ID_CACHE[id]
        : await eth.getBlockNumber();
    FILL_BLOCK_NUMBER_BY_QUOTE_ID_CACHE[id] = blockNumber;
    try {
        let result = normalizeSwapResult(
            await takerContract
                .fill({
                    to: quote.to,
                    makerToken: TOKENS[makerToken].address,
                    takerToken: TOKENS[takerToken].address,
                    wallet: TOKENS[takerToken].wallet,
                    spender: quote.allowanceTarget || CONFIG.erc20Proxy,
                    exchange: CONFIG.exchange,
                    data: quote.data,
                    orders: quote.orders,
                    protocolFeeAmount: quote.protocolFee,
                    sellAmount: maxSellAmount,
                    transformerDeployer: transformerDeployer.address,
                    transformersDeployData: transformers.map(
                        ({ deployData }) => deployData
                    ),
                    deployer: CONFIG.deployments.deployer,
                    deployments: await createDeploymentsData(),
                })
                .call({
                    block: blockNumber,
                    gas: 20e6,
                    gasPrice: quote.gasPrice,
                    value: quote.value,
                    from: TOKENS['ETH'].wallet,
                    overrides: {
                        [takerContract.address]: {
                            code: ARTIFACTS.MarketCallTaker.deployedBytecode,
                        },
                        [TOKENS[takerToken].wallet]: {
                            code: ARTIFACTS.HackedWallet.deployedBytecode,
                        },
                        [CONFIG.gst]: {
                            code: ARTIFACTS.NoGST.deployedBytecode,
                        },
                        [CONFIG.deployments.deployer]: {
                            code: ARTIFACTS.ContractDeployer.deployedBytecode,
                            nonce: CONFIG.deployments.initialNonce,
                        },
                        ...(transformers.length > 0
                            ? {
                                  [transformerDeployer.address]: {
                                      code:
                                          ARTIFACTS.TransformerDeployer
                                              .deployedBytecode,
                                      nonce: transformers[0].deploymentNonce,
                                  },
                                  // Reset state for transformers to be re-deployed.
                                  ..._.zipObject(
                                      transformers.map(
                                          ({ address }) => address
                                      ),
                                      transformers.map((t) => ({
                                          code: '0x',
                                          nonce: 0,
                                          balance: t.balance,
                                      }))
                                  ),
                              }
                            : {}),
                        ...overrides,
                    },
                })
        );
        const success =
            result.revertData === '0x' &&
            new BigNumber(result.boughtAmount).gt(0);
        const txDataGasUsed = countNonzeroBytes(quote.data) * 16;
        const gasUsed = result.gasUsed + txDataGasUsed;
        const boughtAmountUsd = fromTokenWeis(
            makerToken,
            result.boughtAmount
        ).times(TOKENS[makerToken].value);
        const soldAmountUsd = fromTokenWeis(
            takerToken,
            result.soldAmount
        ).times(TOKENS[takerToken].value);
        const gasUsedUsd = fromTokenWeis(
            'ETH',
            new BigNumber(gasUsed).times(quote.gasPrice)
        ).times(TOKENS['ETH'].value);
        const protocolFeeUsd = fromTokenWeis(
            'ETH',
            new BigNumber(result.protocolFeePaid)
        ).times(TOKENS['ETH'].value);
        const costUsd = gasUsedUsd.plus(protocolFeeUsd);
        const adjustedBoughtAmountUsd = boughtAmountUsd.minus(costUsd);
        const adjustedSoldAmountUsd = soldAmountUsd.plus(costUsd);
        result = {
            ...result,
            success,
            soldAmountUsd,
            boughtAmountUsd,
            protocolFeeUsd,
            gasUsedUsd,
            adjustedBoughtAmountUsd,
            adjustedSoldAmountUsd,
            costUsd,
            gasUsed,
            txDataGasUsed,
        };
        printFillSummary(quote, success, result);
        return {
            ...quote,
            metadata: {
                ...quote.metadata,
                ethUsd: new BigNumber(TOKENS['ETH'].value),
                makerTokenUsd: new BigNumber(TOKENS[makerToken].value),
                makerTokenDecimals: TOKENS[makerToken].decimals,
                takerTokenDecimals: TOKENS[takerToken].decimals,
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
    for (const nonce of Object.keys(overrides).map((k) => parseInt(k))) {
        const override = overrides[nonce];
        transformers.push({
            deploymentNonce: nonce,
            deployData: await createContractFromArtifactPath(
                override.artifactPath
            )
                .new(...(override.constructorArgs || []))
                .encode(),
            address: toDeployedAddress(CONFIG.transformers.deployer, nonce),
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
        })
    );
}

function printFillSummary(quote, success, result) {
    const {
        side,
        makerToken,
        takerToken,
        fillDelay,
        fillValue,
    } = quote.metadata;
    let { sellAmount, buyAmount } = quote;
    sellAmount = new BigNumber(sellAmount)
        .div(10 ** TOKENS[takerToken].decimals)
        .toFixed(2);
    buyAmount = new BigNumber(buyAmount)
        .div(10 ** TOKENS[makerToken].decimals)
        .toFixed(2);
    const summary = `${side.toUpperCase()} ${takerToken.bold}->${
        makerToken.bold
    } ${sellAmount.yellow} -> ${buyAmount.yellow} ($${fillValue.toFixed(
        2
    )}) after ${fillDelay.toFixed(1)}s`;
    let composition = quote.sources
        .map((s) => `${s.name}: ${s.proportion * 100}%`)
        .join(', ');
    if (doesQuoteHaveFallback(quote)) {
        composition = `${composition} (+ fallback)`;
    }
    if (success) {
        let soldAmount = new BigNumber(result.soldAmount)
            .div(10 ** TOKENS[takerToken].decimals)
            .toFixed(2);
        let boughtAmount = new BigNumber(result.boughtAmount)
            .div(10 ** TOKENS[makerToken].decimals)
            .toFixed(2);
        let gasUsed = new BigNumber(result.gasUsed);
        let usdDisplay =
            side === 'sell'
                ? `($${result.adjustedBoughtAmountUsd.toFixed(2)}) ($${
                      result.costUsd.toFixed(2).red
                  })`
                : `($${result.adjustedSoldAmountUsd.toFixed(2)}) ($${
                      result.costUsd.toFixed(2).red
                  })`;
        console.info(
            `${summary} @ ${quote.metadata.api.bold}\n\t${
                '✔ PASS'.green.bold
            } ${soldAmount.yellow} -> ${
                boughtAmount.yellow
            } ${usdDisplay}\n\t${composition}\n\tgas: ${
                gasUsed.toString(10).red
            }`
        );
    } else {
        let revertInfo = result.revertData;
        try {
            revertInfo = RevertError.decode(result.revertData);
        } catch (e) {}
        console.info(
            `${summary} @ ${quote.metadata.api.bold}\n\t${
                '✘ FAIL'.red.bold
            } (${revertInfo})\n\t${composition}`
        );
    }
}

function doesQuoteHaveFallback(quote) {
    const nativeOrders = quote.orders.filter((o) =>
        /^0xf47261b0/.test(o.makerAssetData)
    );
    if (nativeOrders.length == 0) {
        return false;
    }
    const bridgeOrders = quote.orders.filter(
        (o) => !/^0xf47261b0/.test(o.makerAssetData)
    );
    if (quote.metadata.side === 'sell') {
        const totalBridgesTakerAssetAmount = BigNumber.sum(
            ...bridgeOrders.map((o) => o.takerAssetAmount)
        );
        return totalBridgesTakerAssetAmount.gte(quote.sellAmount);
    } else {
        const totalBridgesMakerAssetAmount = BigNumber.sum(
            ...bridgeOrders.map((o) => o.makerAssetAmount)
        );
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
        protocolFeePaid: result.protocolFeePaid,
    };
}

function countNonzeroBytes(bytes) {
    const buf = ethjs.toBuffer(bytes);
    let count = 0;
    for (const b of buf) {
        if (b != 0) {
            ++count;
        }
    }
    return count;
}

async function createDeploymentsData() {
    const data = [];
    for (const c of CONFIG.deployments.contracts) {
        data.push({
            data: await createContractFromArtifactPath(c.artifactPath)
                .new(...(c.constructorArgs || []))
                .encode(),
            value: c.value || 0,
        });
    }
    return data;
}

module.exports = {
    fillSellQuote,
    fillBuyQuote,
};
