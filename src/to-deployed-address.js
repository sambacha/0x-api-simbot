'use strict';
require('colors');
const yargs = require('yargs');
const _ = require('lodash');

const { toDeployedAddress, loadConfig } = require('./utils');

const CONFIG = loadConfig();

const ARGV = yargs
    .option('deployer', {
        alias: 'd',
        type: 'string',
        default: CONFIG.deployments.deployer,
        describe: 'address of the deployer',
    })
    .option('index', {
        alias: ['i', 'n', 'nonce'],
        type: 'number',
        default: 0,
        describe: 'deployment index (nonce)',
    }).argv;

(async () => {
    const address = toDeployedAddress(ARGV.deployer, ARGV.index);
    console.info(
        `deployer: ${ARGV.deployer.gray}, nonce: ${
            ARGV.index.toString().gray
        }: ${address.bold.green}`
    );
})();
