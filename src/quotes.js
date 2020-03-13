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

const { delay, randomAddress, toHex, toTokenAmount } = require('./utils');
const TOKENS = require('./tokens');

const ERC20_PROXY = '0x95e6f48254609a6ee006f7d493c8e5fb97094cef';
const EXCHANGE = '0x61935cbdd02287b511119ddb11aeb42f1593b7ef';
const BUILD_ROOT = path.resolve(__dirname, '../build');
const ABIS = {
    MarketCallTaker: JSON.parse(fs.readFileSync(`${BUILD_ROOT}/MarketCallTaker.abi`)),
    HackedWallet: JSON.parse(fs.readFileSync(`${BUILD_ROOT}/HackedWallet.abi`)),
};
const BYTECODES = {
    MarketCallTaker: '0x' + fs.readFileSync(`${BUILD_ROOT}/MarketCallTaker.bin-runtime`),
    HackedWallet: '0x' + fs.readFileSync(`${BUILD_ROOT}/HackedWallet.bin-runtime`),
};

const eth = new FlexEther({ providerURI: process.env.NODE_RPC });
const takerContract = new FlexContract(ABIS.MarketCallTaker, { eth });

async function fillSellQuote(opts) {
    const { makerToken, takerToken, swapValue, apiPath, fillDelay, id } = opts;
    const quoteTime = Date.now();
    const takerTokenAmount =
        toTokenAmount(takerToken, new BigNumber(swapValue).div(TOKENS[takerToken].value));
    const qs = [
        `buyToken=${makerToken}`,
        `sellToken=${takerToken}`,
        `sellAmount=${takerTokenAmount.toString(10)}`,
    ].join('&');
    const resp = await fetch(`${apiPath}?${qs}`);
    const quoteResult = await resp.json();
    const quote = {
        ...quoteResult,
        metadata: {
            id,
            makerToken,
            takerToken,
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

async function fillQuote(quote) {
    const { side, makerToken, takerToken, fillAmount, fillDelay, fillValue } = quote.metadata;
    const fillSize = side === 'sell'
        ? new BigNumber(fillAmount).div(10 ** TOKENS[takerToken].decimals).toFixed(2)
        : new BigNumber(fillAmount).div(10 ** TOKENS[makerToken].decimals).toFixed(2);
    console.log(
        `* Filling ${takerToken.bold}->${makerToken.bold} ${fillSize.yellow} ($${fillValue.toFixed(2)}) ${side} after ${fillDelay.toFixed(1)}s...`,
    );
    console.log('Composition:', quote.sources.map(s => `${s.name}: ${s.proportion * 100}%`).join(', '));
    const takerContractAddress = randomAddress();
    try {
        const result = decodeSwapResult(await eth.rpc._send(
            'eth_call',
            [
                {
                    to: takerContractAddress,
                    gas: toHex(8e6),
                    from: TOKENS['ETH'].wallet,
                    gasPrice: toHex(quote.gasPrice),
                    value: toHex(quote.value),
                    data: await takerContract.fill({
                        to: quote.to,
                        makerToken: TOKENS[makerToken].address,
                        takerToken: TOKENS[takerToken].address,
                        wallet: TOKENS[takerToken].wallet,
                        spender: ERC20_PROXY,
                        exchange: EXCHANGE,
                        data: quote.data,
                        orders: quote.orders,
                    }).encode(),
                },
                'latest',
                {
                    [takerContractAddress]: { code: BYTECODES.MarketCallTaker },
                    [TOKENS[takerToken].wallet]: { code: BYTECODES.HackedWallet },
                },
            ],
        ));
        let success = result.revertData === '0x' &&
            new BigNumber(result.boughtAmount).gte(0);
        if (success) {
            console.log(`\t${'✔'.green} PASS`.bold);
        } else {
            console.log(`\t${'✘'.red} FAIL`.bold, `(${result.revertData})`);
        }
        return {
            ...quote,
            metadata: {
                ...quote.metadata,
                swapResult: result,
            },
        };
    } catch (err) {
        console.error(err);
    }
}

function decodeSwapResult(encodedResult) {
    const outputs = ABIS.MarketCallTaker.find(a => a.type === 'function' && a.name === 'fill').outputs;
    try {
        const r = AbiEncoder.decodeParameters(outputs, encodedResult)[0];
        return {
            gasUsed: parseInt(r.gasStart) - parseInt(r.gasEnd),
            blockNumber: parseInt(r.blockNumber),
            revertData: r.revertData,
            boughtAmount: r.boughtAmount,
            soldAmount: r.soldAmount,
            orderInfos: r.orderInfos.map(info => ({
                orderHash: info.orderHash,
                orderStatus: parseInt(info.orderStatus),
                orderTakerAssetFilledAmount: info.orderTakerAssetFilledAmount,
            })),
        };
    } catch (err) {
        console.error(encodedResult);
        throw err;
    }
}

module.exports = {
    fillSellQuote,
};
