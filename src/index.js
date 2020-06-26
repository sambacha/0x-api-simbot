'use strict'
require('colors');
const BigNumber = require('bignumber.js');
const yargs = require('yargs');
const _ = require('lodash');

const { forever, getRandomBracketValue, LogWriter } = require('./utils');
const { fillBuyQuote, fillSellQuote } = require('./quotes');
const {
    DELAY_STOPS,
    FILL_STOPS,
    LIVE_API_PATH,
} = require('./constants');

const ARGV = yargs
    .string('output').demand('output')
    .string('url').default('url', LIVE_API_PATH)
    .array('token').default('token', ['WETH', 'DAI', 'USDC'])
    .boolean('buys').default('buys', false)
    .boolean('sells').default('sells', false)
    .number('jobs').default('jobs', 1)
    .argv;

(async () => {
    if (ARGV.token.length < 2) {
        throw new Error(`At least 2 tokens must be given.`);
    }
    const logs = new LogWriter(ARGV.output);
    if (ARGV.sells || !ARGV.buys) {
        _.times(ARGV.jobs, () => forever(() => _fillSellQuote(logs)));
    }
    if (ARGV.buys || !ARGV.sells) {
        _.times(ARGV.jobs, () => forever(() => _fillBuyQuote(logs)));
    }
})();

async function _fillSellQuote(logs) {
    let makerToken;
    let takerToken;
    while (true) {
        [makerToken, takerToken] = _.sampleSize(ARGV.token, 2);
        const isMakerEth = ['ETH', 'WETH'].includes(makerToken);
        const isTakerEth = ['ETH', 'WETH'].includes(takerToken);
        if (!isMakerEth || !isTakerEth) {
            break;
        }
    }
    const result = await fillSellQuote({
        makerToken,
        takerToken,
        apiPath: ARGV.url,
        swapValue: getRandomBracketValue(FILL_STOPS),
        fillDelay: getRandomBracketValue(DELAY_STOPS),
    });
    await logs.writeObject(result);
}

async function _fillBuyQuote(logs) {
    let makerToken;
    let takerToken;
    while (true) {
        [makerToken, takerToken] = _.sampleSize(ARGV.token, 2);
        const isMakerEth = ['ETH', 'WETH'].includes(makerToken);
        const isTakerEth = ['ETH', 'WETH'].includes(takerToken);
        if (!isMakerEth || !isTakerEth) {
            break;
        }
    }
    const result = await fillBuyQuote({
        makerToken,
        takerToken,
        apiPath: ARGV.url,
        swapValue: getRandomBracketValue(FILL_STOPS),
        fillDelay: getRandomBracketValue(DELAY_STOPS),
    });
    await logs.writeObject(result);
}
