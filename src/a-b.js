'use strict'
require('colors');
const BigNumber = require('bignumber.js');
const yargs = require('yargs');
const _ = require('lodash');

const { forever, getRandomBracketValue, LogWriter, randomHash, writeEntry } = require('./utils');
const { fillSellQuote } = require('./quotes');
const {
    DELAY_STOPS,
    FILL_STOPS,
    LIVE_API_PATH,
} = require('./constants');

const ARGV = yargs
    .string('output').demand('output')
    .array('url').demand('url')
    .array('token').default('token', ['WETH', 'DAI', 'USDC'])
    .number('jobs').default('jobs', 1)
    .argv;

(async () => {
    if (ARGV.token.length < 2) {
        throw new Error(`At least 2 tokens must be given.`);
    }
    const logs = new LogWriter(ARGV.output);
    _.times(ARGV.jobs, () => forever(() => fillSellQuotes(ARGV.url, logs)));
})();

async function fillSellQuotes(urls, logs) {
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
