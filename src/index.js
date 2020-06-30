'use strict'
require('colors');
const BigNumber = require('bignumber.js');
const yargs = require('yargs');
const _ = require('lodash');

const { forever, getRandomBracketValue, getRandomQuotePair, LogWriter, updateTokenPrices } = require('./utils');
const { fillBuyQuote, fillSellQuote } = require('./quotes');
const {
    DELAY_STOPS,
    FILL_STOPS,
    LIVE_API_PATH,
} = require('./constants');

const ARGV = yargs
    .string('output')
    .string('url').default('url', LIVE_API_PATH)
    .array('token').default('token', ['WETH', 'DAI', 'USDC'])
    .boolean('v0').default('v0', false)
    .boolean('buys').default('buys', false)
    .boolean('sells').default('sells', false)
    .number('jobs').default('jobs', 1)
    .argv;

(async () => {
    if (ARGV.token.length < 2) {
        throw new Error(`At least 2 tokens must be given.`);
    }
    await updateTokenPrices();
    const logs = new LogWriter(ARGV.output);
    if (ARGV.sells || !ARGV.buys) {
        _.times(ARGV.jobs, () => forever(() => _fillSellQuote(logs)));
    }
    if (ARGV.buys || !ARGV.sells) {
        _.times(ARGV.jobs, () => forever(() => _fillBuyQuote(logs)));
    }
})();

async function _fillSellQuote(logs) {
    const [makerToken, takerToken] = getRandomQuotePair(ARGV.token, { v0: ARGV.v0 });
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
    const [makerToken, takerToken] = getRandomQuotePair(ARGV.token, { v0: ARGV.v0 });
    const result = await fillBuyQuote({
        makerToken,
        takerToken,
        apiPath: ARGV.url,
        swapValue: getRandomBracketValue(FILL_STOPS),
        fillDelay: getRandomBracketValue(DELAY_STOPS),
    });
    await logs.writeObject(result);
}
