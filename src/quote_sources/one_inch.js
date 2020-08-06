const BigNumber = require('bignumber.js');
const fetch = require('node-fetch');
const { loadConfig, toTokenWeis } = require('../utils');
const TOKENS = require('../tokens');

const CONFIG = loadConfig();
const ALLOWANCE_TARGET = '0xe4c9194962532feb467dce8b3d42419641c6ed2e';

async function getSellQuote(opts) {
    const { makerToken, takerToken, swapValue, apiPath, apiId, fillDelay, id } = opts;
    const quoteTime = Date.now();
    const takerTokenAmount =
        toTokenWeis(takerToken, new BigNumber(swapValue).div(TOKENS[takerToken].value));
    const qs = [
        ...(/(?:\?(.+))?$/.exec(apiPath)[1] || '').split('&'),
        `toTokenSymbol=${makerToken}`,
        `fromTokenSymbol=${takerToken}`,
        `amount=${takerTokenAmount.toString(10)}`,
        `fromAddress=${CONFIG.taker}`,
        `slippage=1`,
        `disableEstimate=true`
    ].join('&');
    const url = `${apiPath}?${qs}`;
    console.log(url);
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            console.log(`${apiId} says:`, await resp.text());
            return undefined;
        }
        const quoteResult = await resp.json();
        const quote = {
            ...quoteResult,
            allowanceTarget: ALLOWANCE_TARGET,
            orders: [],
            protocolFee: new BigNumber(0),
            sellAmount: quoteResult.fromTokenAmount,
            buyAmount: quoteResult.toTokenAmount,
            price: new BigNumber(quoteResult.toTokenAmount).dividedBy(
                quoteResult.fromTokenAmount
            ),
            // Filter out unused sources.
            sources: quoteResult.exchanges.map(s => ({ name: s.name, proportion: `${s.part}` })).filter(s => s.proportion !== '0'),
            metadata: {
                id,
                makerToken,
                takerToken,
                apiPath,
                api: apiId,
                side: 'sell',
                fillAmount: takerTokenAmount.toString(10),
                fillValue: swapValue,
                timestamp: Math.floor(quoteTime / 1000),
                responseTime: (Date.now() - quoteTime) / 1000,
                fillDelay: fillDelay,
                maxSellAmount: takerTokenAmount,
                ethPrice: TOKENS['ETH'].value,
                sellTokenPrice: TOKENS[takerToken].value,
                buyTokenPrice: TOKENS[makerToken].value,
            }
        };
        return quote;
    } catch (e) {
        console.log(e)
        return undefined;
    }
}

async function getBuyQuote(opts) {
    return undefined;
}

module.exports = {
    getBuyQuote,
    getSellQuote,
}
