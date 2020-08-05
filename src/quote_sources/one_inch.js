const BigNumber = require('bignumber.js');
const fetch = require('node-fetch');
const { toTokenAmount } = require('../utils');
const TOKENS = require('../tokens');

const ALLOWANCE_TARGET = '0xe4c9194962532feb467dce8b3d42419641c6ed2e';

async function getSellQuote(opts) {
    const { makerToken, takerToken, swapValue, apiPath, fillDelay, id } = opts;
    const quoteTime = Date.now();
    const takerTokenAmount =
        toTokenAmount(takerToken, new BigNumber(swapValue).div(TOKENS[takerToken].value));
    const qs = [
        // `toTokenSymbol=${makerToken === "ETH" ? "WETH" : makerToken}`,
        `toTokenSymbol=${makerToken}`,
        `fromTokenSymbol=${takerToken}`,
        `amount=${takerTokenAmount.toString(10)}`,
        `fromAddress=0xd00d00caca000000000000000000000000001337`,
        `slippage=1`,
        `disableEstimate=true`,
        `disabledExchangesList=PMM`
    ].join('&');
    const url = `${apiPath}?${qs}`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            console.log(await resp.text());
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
                side: 'sell',
                fillAmount: takerTokenAmount.toString(10),
                fillValue: swapValue,
                timestamp: Math.floor(quoteTime / 1000),
                responseTime: (Date.now() - quoteTime) / 1000,
                fillDelay: fillDelay,
                maxSellAmount: takerTokenAmount,
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
