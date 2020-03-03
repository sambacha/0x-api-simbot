'use strict'
require('colors');
const IpcProvider = require('web3-providers-ipc');
const FlexContract = require('flex-contract');
const FlexEther = require('flex-ether');
const AbiEncoder = require('web3-eth-abi');
const BigNumber = require('bignumber.js');
const process = require('process');
const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs');
const _ = require('lodash');

const MAX_UINT256 = new BigNumber(2).pow(256).minus(1);
const MIN_FILL_DELAY = 0;
const MAX_FILL_DELAY = 300;
const FILL_STOPS = [250, 1e3, 5e3, 10e3, 25e3]
const API_PATH = 'https://api.0x.org/swap/v0/quote';
const ERC20_PROXY = '0x95e6f48254609a6ee006f7d493c8e5fb97094cef';
const EXCHANGE = '0x61935cbdd02287b511119ddb11aeb42f1593b7ef';
const TOKENS = {
    'ETH': {
        decimals: 18,
        address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        wallet: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
        value: 225,
    },
    'DAI': {
        decimals: 18,
        address: '0x6b175474e89094c44da98b954eedeac495271d0f',
        wallet: '0xdfbaf3e4c7496dad574a1b842bc85b402bdc298d',
        value: 1,
    },
    'USDC': {
        decimals: 6,
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        wallet: '0x0a3c8780cb5836a96288b9ab50a472276f4e5726',
        value: 1,
    },
    // 'MKR': {
    //     decimals: 18,
    //     address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
    //     wallet: '0x000be27f560fef0253cac4da8411611184356549',
    //     value: 580,
    // },
    // 'ZRX': {
    //     decimals: 18,
    //     address: '0xe41d2489571d322189246dafa5ebde1f4699f498',
    //     wallet: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
    //     value: 0.25,
    // },
    // 'LINK': {
    //     decimals: 18,
    //     address: '0x514910771af9ca656af840dff83e8264ecf986ca',
    //     wallet: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
    //     value: 4,
    // },
    // 'USDT': {
    //     decimals: 6,
    //     address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    //     wallet: '0x28f635f5f4373559e1db437d7002d386cf718338',
    //     value: 1,
    // },
    // 'WBTC': {
    //     decimals: 8,
    //     address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    //     wallet: '0xc11b1268c1a384e55c48c2391d8d480264a3a7f4',
    //     value: 8.5e3,
    // },
};
const BUILD_ROOT = path.resolve(__dirname, '../build');
const ABIS = {
    MarketCallTaker: JSON.parse(fs.readFileSync(`${BUILD_ROOT}/MarketCallTaker.abi`)),
    HackedWallet: JSON.parse(fs.readFileSync(`${BUILD_ROOT}/HackedWallet.abi`)),
    HackedExchange: JSON.parse(fs.readFileSync(`${BUILD_ROOT}/HackedExchange.abi`)),
};
const BYTECODES = {
    MarketCallTaker: '0x' + fs.readFileSync(`${BUILD_ROOT}/MarketCallTaker.bin-runtime`),
    HackedWallet: '0x' + fs.readFileSync(`${BUILD_ROOT}/HackedWallet.bin-runtime`),
    HackedExchange: '0x' + fs.readFileSync(`${BUILD_ROOT}/HackedExchange.bin-runtime`),
};
const ARGV = yargs
    .string('output')
    .demand('output')
    .number('jobs')
    .default('jobs', 1)
    .argv;

const eth = new FlexEther({ providerURI: process.env.NODE_RPC });
const takerContract = new FlexContract(ABIS.MarketCallTaker, { eth });

(async () => {
    _.times(ARGV.jobs, () => forever(() => fillSellQuote()));
    // forever(() => fillBuyQuote());
})();

async function fillSellQuote() {
    const [makerToken, takerToken] = _.sampleSize(Object.keys(TOKENS), 2);
    const takerValue = getRandomFillValue();
    const takerTokenAmount = toTokenAmount(takerToken, takerValue.div(TOKENS[takerToken].value));
    const qs = [
        `buyToken=${makerToken}`,
        `sellToken=${takerToken}`,
        `sellAmount=${takerTokenAmount.toString(10)}`,
    ].join('&');
    const resp = await fetch(`${API_PATH}?${qs}`);
    const quote = {
        ...await resp.json(),
        metadata: {
            makerToken,
            takerToken,
            side: 'sell',
            fillAmount: takerTokenAmount.toString(10),
            fillValue: takerValue.toFixed(2),
            timestamp: Math.floor(Date.now() / 1000),
            fillDelay: _.random(MIN_FILL_DELAY, MAX_FILL_DELAY),
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
        `* Filling ${takerToken.bold}->${makerToken.bold} ${fillSize.yellow} ($${fillValue}) ${side} after ${fillDelay}s...`,
    );
    console.log('Composition:', quote.sources.map(s => `${s.name}: ${s.proportion * 100}%`).join(', '));
    const takerContractAddress = randomAddress();
    const exchangeAddress = randomAddress();
    try {
        const exchangeBytecode = await eth.getCode(EXCHANGE);
        const result = decodeSwapResult(await eth.rpc._send(
            'eth_call',
            [
                {
                    to: takerContractAddress,
                    gas: toHex(8e6),
                    gasPrice: toHex(quote.gasPrice),
                    value: toHex(quote.value),
                    data: await takerContract.fill({
                        to: quote.to,
                        makerToken: TOKENS[makerToken].address,
                        takerToken: TOKENS[takerToken].address,
                        wallet: TOKENS[takerToken].wallet,
                        spender: ERC20_PROXY,
                        exchange: exchangeAddress,
                        hackedExchange: EXCHANGE,
                        data: quote.data,
                        orders: quote.orders,
                    }).encode(),
                },
                'latest',
                {
                    [exchangeAddress]: { code: exchangeBytecode },
                    [EXCHANGE]: { code: BYTECODES.HackedExchange },
                    [takerContractAddress]: { code: BYTECODES.MarketCallTaker },
                    [TOKENS[takerToken].wallet]: { code: BYTECODES.HackedWallet },
                },
            ],
        ));
        if (new BigNumber(result.boughtAmount).div(quote.buyAmount).abs().gte(2)) {
            console.log(result);
            throw new Error('bizarre result?');
        }
        let success = result.revertData === '0x' &&
            new BigNumber(result.boughtAmount).gte(0);
        if (success) {
            console.log(`\t${'✔'.green} PASS`.bold);
        } else {
            console.log(`\t${'✘'.red} FAIL`.bold, `(${result.revertData})`);
        }
        await writeResult({
            ...quote,
            metadata: {
                ...quote.metadata,
                swapResult: result,
            },
        });
    } catch (err) {
        console.error(err);
    }
}

function decodeSwapResult(encodedResult) {
    const outputs = ABIS.MarketCallTaker.find(a => a.type === 'function' && a.name === 'fill').outputs;
    try {
        const r = AbiEncoder.decodeParameters(outputs, encodedResult)[0];
        return {
            gasLeft: parseInt(r.gasLeft),
            blockNumber: parseInt(r.blockNumber),
            revertData: r.revertData,
            boughtAmount: r.boughtAmount,
            fills: r.fills.map(f => ({
                orderInfo: {
                    orderStatus: f.orderInfo.orderStatus,
                    orderHash: f.orderInfo.orderHash,
                    orderTakerAssetFilledAmount: f.orderInfo.orderTakerAssetFilledAmount,
                },
                fillResults: {
                    makerAssetFilledAmount: f.fillResults.makerAssetFilledAmount,
                    takerAssetFilledAmount: f.fillResults.takerAssetFilledAmount,
                    makerFeePaid: f.fillResults.makerFeePaid,
                    takerFeePaid: f.fillResults.takerFeePaid,
                    protocolFeePaid: f.fillResults.protocolFeePaid,
                },
            })),
            orderInfos: r.orderInfos.map(info => ({
                orderHash: info.orderHash,
                orderStatus: info.orderStatus,
                orderTakerAssetFilledAmount: info.orderTakerAssetFilledAmount,
            })),
        };
    } catch (err) {
        console.error(encodedResult);
        throw err;
    }
}

async function writeResult(entry) {
    return fs.promises.writeFile(
        path.resolve(ARGV.output),
        `${JSON.stringify(entry)}\n`,
        { flag: 'a' },
    );
}

function randomAddress() {
    return `0x${crypto.randomBytes(20).toString('hex')}`;
}

function toHex(v) {
    return `0x${new BigNumber(v).integerValue().toString(16)}`;
}

async function delay(cb, delay) {
    return new Promise((accept, reject) => {
        setTimeout(
            async () => {
                try {
                    accept(await cb());
                } catch (err) {
                    reject(err);
                }
            },
            delay,
        );
    });
}

function forever(cb) {
    const repeater = async () => {
        await cb();
        setTimeout(repeater, 0);
    };
    repeater();
}

function getRandomFillValue() {
    const i = _.random(0, FILL_STOPS.length - 1);
    const min = i == 0 ? 0 : FILL_STOPS[i - 1];
    const max = FILL_STOPS[i];
    return new BigNumber(max).minus(min).times(Math.random()).plus(min);
}

function toTokenAmount(token, units) {
    const base = new BigNumber(10).pow(TOKENS[token].decimals);
    return units.times(base).integerValue();
}
