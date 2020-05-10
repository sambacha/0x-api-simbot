'use strict'
require('colors');
const BigNumber = require('bignumber.js');
const yargs = require('yargs');
const _ = require('lodash');

const { forever, getRandomBracketValue, LogWriter, randomHash, writeEntry } = require('./utils');
const { fetchSellQuote, fillQuote } = require('./quotes');
const { toTransformQuote } = require('./transform_quotes');
const {
    DELAY_STOPS,
    FILL_STOPS,
    LIVE_API_PATH,
} = require('./constants');

const ARGV = yargs
    .string('output').demand('output')
    .string('url').demand('url')
    .array('token').default('token', ['ETH', 'DAI', 'USDC'])
    .number('jobs').default('jobs', 1)
    .argv;

(async () => {
    if (ARGV.token.length < 2) {
        throw new Error(`At least 2 tokens must be given.`);
    }
    const logs = new LogWriter(ARGV.output);
    _.times(ARGV.jobs, () => forever(() => fillSellQuotes(ARGV.url, logs)));
})();

async function fillSellQuotes(url, logs) {
    let [makerToken, takerToken] = _.sampleSize(ARGV.token, 2);
    if (makerToken === 'ETH') {
        makerToken = 'WETH';
    }
    const id = randomHash();
    const swapValue = getRandomBracketValue(FILL_STOPS);
    const quote = await fetchSellQuote({
        makerToken,
        takerToken,
        swapValue,
        apiPath: url,
    });
    if (quote.data) {
        const results = await Promise.all([
            fillQuote(_.merge({}, quote, {metadata: { apiPath: 'standard'}})),
            fillQuote(_.merge({}, toTransformQuote(quote), { metadata: {apiPath: 'transformers'}})),
        ]);
        await Promise.all(
            results.filter(r => !!r).map((r, i) => logs.writeObject(
                { ...r, metadata: { ...r.metadata, id, apiURL: url } },
            )),
        );
    }
}
