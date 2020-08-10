'use strict';
require('colors');
const yargs = require('yargs');
const _ = require('lodash');

const {
    forever,
    getRandomBracketValue,
    getRandomQuotePair,
    LogWriter,
    parseURLSpec,
    randomHash,
    updateTokenPrices,
    updateTokenWallets,
} = require('./utils');
const TOKENS = require('./tokens');
const { fillBuyQuote, fillSellQuote } = require('./quotes');
const { DELAY_STOPS, FILL_STOPS, LIVE_API_PATH } = require('./constants');

const ARGV = yargs
    .option('output', {
        alias: 'o',
        type: 'string',
        describe: 'JSON file to output results to',
    })
    .option('url', {
        alias: 'u',
        type: 'string',
        demandOption: true,
        default: LIVE_API_PATH,
        describe: 'swap/quote endpoint URL',
    })
    .option('token', {
        alias: 't',
        type: 'array',
        choices: Object.keys(TOKENS),
        default: ['WETH', 'DAI'],
        // default: ['USDC', 'DAI'],
        describe: 'token to use in quotes (can be repeated)',
    })
    .option('v0', {
        type: 'boolean',
        describe: 'run in v0 compat mode',
    })
    .option('buys', {
        alias: 'buy',
        type: 'boolean',
        describe: 'only perform buys',
    })
    .option('sells', {
        alias: 'sell',
        type: 'boolean',
        describe: 'only perform sells',
    })
    .option('jobs', {
        alias: 'j',
        type: 'number',
        default: 8,
        describe: 'number of jobs/quotes to run in parallel',
    }).argv;

(async () => {
    if (ARGV.token.length < 2) {
        throw new Error(`At least 2 tokens must be given.`);
    }
    await updateTokenWallets();
    // Keep token prices up to date for long running tests
    forever(() => updateTokenPrices(), 300000);
    const logs = new LogWriter(ARGV.output);
    if (ARGV.sells || !ARGV.buys) {
        _.times(ARGV.jobs, (i) =>
            forever(() => _fillSellQuote(logs, 1000, i * 1000))
        );
    }
    if (ARGV.buys || !ARGV.sells) {
        _.times(ARGV.jobs, (i) =>
            forever(() => _fillBuyQuote(logs), 1000, i * 1000)
        );
    }
})();

async function _fillSellQuote(logs) {
    const [makerToken, takerToken] = getRandomQuotePair(ARGV.token, {
        v0: ARGV.v0,
    });
    const result = await fillSellQuote({
        makerToken,
        takerToken,
        id: randomHash(),
        apiPath: parseURLSpec(ARGV.url).url,
        apiId: parseURLSpec(ARGV.url).id,
        swapValue: getRandomBracketValue(FILL_STOPS),
        fillDelay: getRandomBracketValue(DELAY_STOPS),
    });
    await logs.writeObject(result);
}

async function _fillBuyQuote(logs) {
    const [makerToken, takerToken] = getRandomQuotePair(ARGV.token, {
        v0: ARGV.v0,
    });
    const result = await fillBuyQuote({
        makerToken,
        takerToken,
        id: randomHash(),
        apiPath: parseURLSpec(ARGV.url).url,
        apiId: parseURLSpec(ARGV.url).id,
        swapValue: getRandomBracketValue(FILL_STOPS),
        fillDelay: getRandomBracketValue(DELAY_STOPS),
    });
    await logs.writeObject(result);
}
