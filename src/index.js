'use strict'
require('colors');
const BigNumber = require('bignumber.js');
const yargs = require('yargs');
const _ = require('lodash');

const { forever, getRandomBracketValue, LogWriter } = require('./utils');
const { fillSellQuote } = require('./quotes');
const {
    DELAY_STOPS,
    FILL_STOPS,
    LIVE_API_PATH,
} = require('./constants');

const ARGV = yargs
    .string('output').demand('output')
    .string('url').default('url', LIVE_API_PATH)
    .array('token').default('token', ['ETH', 'DAI', 'USDC'])
    .number('jobs').default('jobs', 1)
    .argv;

(async () => {
    if (ARGV.token.length < 2) {
        throw new Error(`At least 2 tokens must be given.`);
    }
    const logs = new LogWriter(ARGV.output);
    _.times(ARGV.jobs, () => forever(() => _fillSellQuote(logs)));
})();

async function _fillSellQuote(logs) {
    const [makerToken, takerToken] = _.sampleSize(ARGV.token, 2);
    const result = await fillSellQuote({
        makerToken,
        takerToken,
        apiPath: ARGV.url,
        swapValue: getRandomBracketValue(FILL_STOPS),
        fillDelay: getRandomBracketValue(DELAY_STOPS),
    });
    await logs.writeObject(result);
}
