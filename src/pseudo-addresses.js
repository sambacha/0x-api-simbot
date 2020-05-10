'use strict'
const ethjs = require('ethereumjs-util');

const TAKER_ADDRESS = '0xa59729fad14aa48ff33e1ff097737be04dddccc9';
// Taker contract's nonce starts at 0 because it's injected.
const FULL_MIGRATION_ADDRESS = getContractDeployedAddress(TAKER_ADDRESS, 5);
const WETH_TRANSFORMER_ADDRESS = getContractDeployedAddress(TAKER_ADDRESS, 6);
const PAY_TAKER_TRANSFORMER_ADDRESS = getContractDeployedAddress(TAKER_ADDRESS, 7);
const FILL_QUOTE_TRANSFORMER_ADDRESS = getContractDeployedAddress(TAKER_ADDRESS, 8);
const ZERO_EX_ADDRESS = getContractDeployedAddress(FULL_MIGRATION_ADDRESS, 1);

function getContractDeployedAddress(deployer, nonce) {
    return ethjs.toChecksumAddress(
        ethjs.bufferToHex(
            ethjs.rlphash([deployer, nonce]).slice(12),
        ),
    );
}

module.exports = {
    TAKER_ADDRESS,
    ZERO_EX_ADDRESS,
    WETH_TRANSFORMER_ADDRESS,
    PAY_TAKER_TRANSFORMER_ADDRESS,
    FILL_QUOTE_TRANSFORMER_ADDRESS,
};
