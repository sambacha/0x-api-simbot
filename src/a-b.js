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
} = require('./utils');
const TOKENS = require('./tokens');
const { fillBuyQuote, fillSellQuote } = require('./quotes');
const { DELAY_STOPS, FILL_STOPS, LIVE_API_PATH } = require('./constants');
const { createConnectionAsync, saveResultAsync } = require('./upload');

const ARGV = yargs
    .option('output', {
        alias: 'o',
        type: 'string',
        describe: 'JSON file to output results to',
    })
    .option('url', {
        alias: 'u',
        type: 'array',
        demandOption: true,
        default: LIVE_API_PATH,
        describe: 'swap/quote endpoint URL (can be repeated)',
    })
    .option('token', {
        alias: 't',
        type: 'array',
        choices: Object.keys(TOKENS),
        default: ['WETH', 'WBTC', 'DAI', 'USDC'],
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
    })
    .option('db', {
        type: 'string',
        describe: 'URI to the database to upload to',
    }).argv;

const runId = randomHash();
let dbConnection;

(async () => {
    if (ARGV.token.length < 2) {
        throw new Error(`At least 2 tokens must be given.`);
    }
    if (ARGV.db) {
        dbConnection = await createConnectionAsync(ARGV.db);
    }
    console.log(`Simulation run` + `${runId}`.yellow);
    console.log(`Tokens: ${ARGV.token}`);
    const logs = new LogWriter(ARGV.output);
    if (ARGV.sells || !ARGV.buys) {
        _.times(ARGV.jobs, () => forever(() => fillSellQuotes(ARGV.url, logs)));
    }
    if (ARGV.buys || !ARGV.sells) {
        _.times(ARGV.jobs, () => forever(() => fillBuyQuotes(ARGV.url, logs)));
    }
    // Keep token prices up to date for long running tests
    forever(() => updateTokenPrices(), 300000);
})();

async function fillSellQuotes(urls, logs) {
    const [makerToken, takerToken] = getRandomQuotePair(ARGV.token, {
        v0: ARGV.v0,
    });
    const id = randomHash();
    const swapValue = getRandomBracketValue(FILL_STOPS);
    const fillDelay = getRandomBracketValue(DELAY_STOPS);
    const _urls = urls.map(u => parseURLSpec(u));
    const results = await Promise.all(_urls.map(
        url => fillSellQuote({
            id,
            makerToken,
            takerToken,
            swapValue,
            fillDelay,
            apiPath: url.url,
            apiPathId: url.id,
        }),
    ));
    await Promise.all(
        results
            .filter(r => !!r)
            .map((r, i) => {
                const normalizedResult = {
                    ...r,
                    metadata: { ...r.metadata, runId },
                };
                const persistPromises = [];
                if (dbConnection) {
                    persistPromises.push(
                        // Hack convert BigNumbers to strings for persistence
                        saveResultAsync(dbConnection, JSON.parse(JSON.stringify(normalizedResult)))
                    );
                }
                persistPromises.push(logs.writeObject(normalizedResult));
                return Promise.all(persistPromises);
            }),
    );
}

async function fillBuyQuotes(urls, logs) {
    const [makerToken, takerToken] = getRandomQuotePair(ARGV.token, {
        v0: ARGV.v0,
    });
    const id = randomHash();
    const swapValue = getRandomBracketValue(FILL_STOPS);
    const fillDelay = getRandomBracketValue(DELAY_STOPS);
    const _urls = urls.map(u => parseURLSpec(u));
    const results = await Promise.all(_urls.map(
        url => fillBuyQuote({
            id,
            makerToken,
            takerToken,
            swapValue,
            fillDelay,
            apiPath: url.url,
            apiPathId: url.id,
        }),
    ));
    await Promise.all(
        results
            .filter((r) => !!r)
            .map((r, i) =>
                const normalizedResult = {
                    ...r,
                    metadata: { ...r.metadata, runId },
                };
                const persistPromises = [];
                if (dbConnection) {
                    persistPromises.push(
                        // Hack convert BigNumbers to strings for persistence
                        saveResultAsync(dbConnection, JSON.parse(JSON.stringify(normalizedResult)))
                    );
                }
                persistPromises.push(logs.writeObject(normalizedResult));
                return Promise.all(persistPromises);
            ),
    );
}
