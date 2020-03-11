'use strict'
const BigNumber = require('bignumber.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');

const TOKENS = require('./tokens');

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
        setTimeout(
            async () => {
                try {
                    accept(await cb());
                } catch (err) {
                    reject(err);
                }
            },
            delay,
        );
    });
}

function forever(cb) {
    const repeater = async () => {
        await cb();
        setTimeout(repeater, 0);
    };
    repeater();
}

function getRandomBracketValue(stops) {
    const i = _.random(0, stops.length - 1);
    const min = i == 0 ? 0 : stops[i - 1];
    const max = stops[i];
    return ((max - min) * Math.random()) + min;
}

function toTokenAmount(token, units) {
    const base = new BigNumber(10).pow(TOKENS[token].decimals);
    return units.times(base).integerValue();
}

class LogWriter {
    constructor(file) {
        this._filePromise = fs.promises.open(path.resolve(file), 'a+');
        this._writeQueue = [];
        this._flush();
    }

    async writeObject(obj) {
        return new Promise((accept, reject) => {
            this._writeQueue.push({
                accept,
                reject,
                data: `${JSON.stringify(obj)}\n`,
            });
        });
    }

    async _flush() {
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

module.exports = {
    randomAddress,
    randomHash,
    toHex,
    delay,
    forever,
    getRandomBracketValue,
    toTokenAmount,
    LogWriter,
}
