'use strict'
require('colors');
const BigNumber = require('bignumber.js');
const yargs = require('yargs');
const _ = require('lodash');

const {
    forever,
    getRandomBracketValue,
    getRandomQuotePair,
    LogWriter,
    randomHash,
    updateTokenPrices,
    writeEntry,
} = require('./utils');
const { fillBuyQuote, fillSellQuote } = require('./quotes');
const {
    DELAY_STOPS,
    FILL_STOPS,
    LIVE_API_PATH,
} = require('./constants');

const ARGV = yargs
    .string('output')
    .array('url').demand('url')
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
        _.times(ARGV.jobs, () => forever(() => fillSellQuotes(ARGV.url, logs)));
    }
    if (ARGV.buys || !ARGV.sells) {
        _.times(ARGV.jobs, () => forever(() => fillBuyQuotes(ARGV.url, logs)));
    }
})();

async function fillSellQuotes(urls, logs) {
    const [makerToken, takerToken] = getRandomQuotePair(ARGV.token, { v0: ARGV.v0 });
    const id = randomHash();
    const swapValue = getRandomBracketValue(FILL_STOPS);
    const fillDelay = getRandomBracketValue(DELAY_STOPS);
    const results = await Promise.all(urls.map(
        apiPath => fillSellQuote({
            makerToken,
            takerToken,
            apiPath,
            swapValue,
            fillDelay,
        }),
    ));
    await Promise.all(
        results.filter(r => !!r).map((r, i) => logs.writeObject(
            { ...r, metadata: { ...r.metadata, id, apiURL: urls[i] } },
        )),
    );
}

async function fillBuyQuotes(urls, logs) {
    const [makerToken, takerToken] = getRandomQuotePair(ARGV.token, { v0: ARGV.v0 });
    const id = randomHash();
    const swapValue = getRandomBracketValue(FILL_STOPS);
    const fillDelay = getRandomBracketValue(DELAY_STOPS);
    const results = await Promise.all(urls.map(
        apiPath => fillBuyQuote({
            makerToken,
            takerToken,
            apiPath,
            swapValue,
            fillDelay,
        }),
    ));
    await Promise.all(
        results.filter(r => !!r).map((r, i) => logs.writeObject(
            { ...r, metadata: { ...r.metadata, id, apiURL: urls[i] } },
        )),
    );
}
