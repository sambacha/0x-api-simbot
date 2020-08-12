'use strict';
const BigNumber = require('bignumber.js');
const crypto = require('crypto');
const fs = require('fs');
const fetch = require('node-fetch');
const path = require('path');
const _ = require('lodash');
const moniker = require('moniker');
const ethjs = require('ethereumjs-util');

const TOKENS = require('./tokens');
const CONFIG_PATH = path.resolve(__dirname, '../config.json');
const CONFIG_TEMPLATE = {
    gst: '0x0000000000b3F879cb30FE243b4Dfee438691c04',
    erc20Proxy: '0x95e6f48254609a6ee006f7d493c8e5fb97094cef',
    exchange: '0x61935cbdd02287b511119ddb11aeb42f1593b7ef',
    forwarder: '0x6958f5e95332d93d21af0d7b9ca85b8212fee0a5',
    taker: '0xd00d00caca000000000000000000000000001337',
    transformers: {
        deployer: '0x80a36559ab9a497fb658325ed771a584eb0f13da',
        overridesByNonce: {},
    },
    overrides: {},
    deployments: {
        deployer: '0xdededededededededededededededededededede',
        initialNonce: 0,
        contracts: [],
    },
};

function randomAddress() {
    return `0x${crypto.randomBytes(20).toString('hex')}`;
}

function randomHash() {
    return `0x${crypto.randomBytes(32).toString('hex')}`;
}

function toHex(v) {
    return `0x${new BigNumber(v).integerValue().toString(16)}`;
}

async function delay(cb, delay) {
    return new Promise((accept, reject) => {
        setTimeout(async () => {
            try {
                accept(await cb());
            } catch (err) {
                reject(err);
            }
        }, delay);
    });
}

function forever(cb, interval = 0, initialDelay = 0) {
    const repeater = async () => {
        try {
            await cb();
        } finally {
            setTimeout(repeater, interval);
        }
    };
    return delay(() => repeater(), initialDelay);
}

function getRandomBracketValue(stops) {
    const i = _.random(0, stops.length - 2);
    const min = stops[i];
    const max = stops[i + 1];
    return (max - min) * Math.random() + min;
}

function toTokenWeis(token, units) {
    const base = new BigNumber(10).pow(TOKENS[token].decimals);
    return new BigNumber(units).times(base).integerValue();
}

function fromTokenWeis(token, weis) {
    const base = new BigNumber(10).pow(TOKENS[token].decimals);
    return new BigNumber(weis).div(base);
}

class LogWriter {
    constructor(file) {
        this._filePromise = file
            ? fs.promises.open(path.resolve(file), 'a+')
            : undefined;
        this._writeQueue = [];
        this._flush();
    }

    async writeObject(obj) {
        if (this._filePromise) {
            return new Promise((accept, reject) => {
                this._writeQueue.push({
                    accept,
                    reject,
                    data: `${JSON.stringify(obj)}\n`,
                });
            });
        }
    }

    async _flush() {
        if (this._filePromise) {
            const file = await this._filePromise;
            while (this._writeQueue.length) {
                const entry = this._writeQueue.shift();
                try {
                    entry.accept(await fs.promises.writeFile(file, entry.data));
                } catch (err) {
                    entry.reject(err);
                }
            }
            setTimeout(() => this._flush(), 1000);
        }
    }
}

function getRandomQuotePair(tokens, opts = {}) {
    let makerToken;
    let takerToken;
    while (true) {
        [makerToken, takerToken] = _.sampleSize(tokens, 4);
        const isMakerEth = ['ETH', 'WETH'].includes(makerToken);
        const isTakerEth = ['ETH', 'WETH'].includes(takerToken);
        if (opts.v0 && makerToken === 'ETH') {
            continue;
        }
        if (!isMakerEth || !isTakerEth) {
            break;
        }
    }
    return [makerToken, takerToken];
}

async function updateTokenPrices() {
    console.info('Updating token prices from coingecko...');
    const cgQueryParams = [
        `ids=${Object.values(TOKENS)
            .map((i) => i.cgId)
            .join(',')}`,
        `vs_currencies=usd`,
    ];
    const resp = await (
        await fetch(
            `https://api.coingecko.com/api/v3/simple/price?${cgQueryParams.join(
                '&'
            )}`
        )
    ).json();
    Object.entries(resp).forEach(([cgId, price]) => {
        for (const symbol in TOKENS) {
            if (TOKENS[symbol].cgId === cgId) {
                TOKENS[symbol].value = price.usd;
            }
        }
    });
    console.info(`Updated ${Object.keys(resp).length} tokens.`);
}

async function updateTokenWallets(tokens) {
    console.info('Updating token wallets from bloxy...');
    await Promise.all(
        Object.entries(TOKENS)
            .filter(([k, t]) => t !== TOKENS['ETH'] && tokens.includes(k))
            .map(async ([k, t]) => {
                try {
                    const resp = await (
                        await fetch(
                            `https://api.bloxy.info/token/token_holders_list?token=${t.address}&key=ACCAsmaX6X9rW&format=structure`
                        )
                    ).json();
                    const walletResult = resp.find(
                        (r) => r.address_type === 'Wallet'
                    );
                    t.wallet =
                        walletResult && walletResult.address
                            ? walletResult.address
                            : t.wallet;
                } catch (e) {
                    console.error(
                        `Unable to update token wallet for ${k}: ${e.message}`
                    );
                }
            })
    );
}

function loadConfig() {
    let rawConfig;
    try {
        rawConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
    } catch (err) {
        rawConfig = JSON.stringify(CONFIG_TEMPLATE);
    }
    const config = _.defaultsDeep(JSON.parse(rawConfig), CONFIG_TEMPLATE);
    const updatedRawConfig = JSON.stringify(config, null, '    ');
    if (updatedRawConfig !== rawConfig) {
        fs.writeFileSync(CONFIG_PATH, updatedRawConfig);
        console.info(`Saved updated config file to ${CONFIG_PATH}`);
    }
    return config;
}

function parseURLSpec(raw) {
    // URLs can be plain or specify an ID.
    // E.g., 'ID=https://...'
    const m = /(?:(.+)=)?([^/]+:\/\/.+)$/.exec(raw);
    if (m[1]) {
        return { id: m[1], url: m[2] };
    }
    return { id: m[2], url: m[2] };
}

function randomMoniker() {
    return moniker
        .generator([moniker.verb, moniker.adjective, moniker.noun])
        .choose();
}

function toDeployedAddress(deployer, nonce) {
    return ethjs.bufferToHex(ethjs.rlphash([deployer, nonce]).slice(12));
}

module.exports = {
    randomAddress,
    randomHash,
    toHex,
    delay,
    forever,
    getRandomBracketValue,
    getRandomQuotePair,
    toTokenWeis,
    fromTokenWeis,
    LogWriter,
    parseURLSpec,
    updateTokenPrices,
    loadConfig,
    randomMoniker,
    updateTokenWallets,
    toDeployedAddress,
};
