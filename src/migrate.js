'use strict';
require('colors');
const FlexContract = require('flex-contract');
const FlexEther = require('flex-ether');
const AbiEncoder = require('web3-eth-abi');
const BigNumber = require('bignumber.js');
const process = require('process');
const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs');
const _ = require('lodash');

const ARGV = yargs
    .string('input')
    .demand('input')
    .string('output')
    .demand('output').argv;

(async () => {
    const swaps = (await fs.promises.readFile(ARGV.input, 'utf-8'))
        .split('\n')
        .filter((s) => s)
        .map((line) => JSON.parse(line));
    for (const swap of swaps) {
        const { metadata } = swap;
        metadata.swapResult.gasUsed = Math.abs(metadata.swapResult.gasUsed);
    }
    await fs.promises.writeFile(
        ARGV.output,
        swaps.map((s) => JSON.stringify(s)).join('\n') + '\n',
        'utf-8'
    );
    console.log(`wrote ${swaps.length} entries`);
})()
    .catch(console.error)
    .then(() => process.exit());
