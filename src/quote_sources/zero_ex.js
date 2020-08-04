const BigNumber = require('bignumber.js');
const fetch = require('node-fetch');
const ethjs = require('ethereumjs-util');
const { toTokenAmount } = require('../utils');
const TOKENS = require('../tokens');

const EXCLUDED_SOURCES = [
    // '0x',
    // 'Curve',
    // 'Uniswap',
    // 'Uniswap_V2',
    // 'Kyber',
    // 'Eth2Dai',
    // 'Balancer',
    // 'MultiBridge',
    // 'LiquidityProvider',
]

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

async function getSellQuote(opts) {
    const { makerToken, takerToken, swapValue, apiPath, fillDelay, id } = opts;
    const quoteTime = Date.now();
    const takerTokenAmount =
        toTokenAmount(takerToken, new BigNumber(swapValue).div(TOKENS[takerToken].value));
    const qs = [
        ...(/(?:\?(.+))?$/.exec(apiPath)[1] || '').split('&'),
        `buyToken=${makerToken}`,
        `sellToken=${takerToken}`,
        `sellAmount=${takerTokenAmount.toString(10)}`,
        `excludedSources=${EXCLUDED_SOURCES.join(',')}`
    ].join('&');
    const url = `${/^(.+?)(\?.+)?$/.exec(apiPath)[1]}?${qs}`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            console.log(await resp.text());
            return undefined;
        }
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
        return quote;
    } catch (e) {
        console.log(e)
        return undefined;
    }
}

async function getBuyQuote(opts) {
    const { makerToken, takerToken, swapValue, apiPath, fillDelay, id } = opts;
    const quoteTime = Date.now();
    const makerTokenAmount =
        toTokenAmount(makerToken, new BigNumber(swapValue).div(TOKENS[makerToken].value));
    const qs = [
        ...(/(?:\?(.+))?$/.exec(apiPath)[1] || '').split('&'),
        `buyToken=${makerToken}`,
        `sellToken=${takerToken}`,
        `buyAmount=${makerTokenAmount.toString(10)}`,
        `excludedSources=${EXCLUDED_SOURCES.join(',')}`
    ].join('&');
    const url = `${/^(.+?)(\?.+)?$/.exec(apiPath)[1]}?${qs}`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            console.log(await resp.text());
            return undefined;
        }
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
    } catch (e) {
        console.log(e);
        return undefined;
    }
    return quote;
}

module.exports = {
    getBuyQuote,
    getSellQuote,
}
