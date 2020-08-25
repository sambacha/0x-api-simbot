'use strict';
const BigNumber = require('bignumber.js');

module.exports = {
    MAX_UINT256: new BigNumber(2).pow(256).minus(1),
    DELAY_STOPS: [0, 30, 60, 90, 180, 300],
    FILL_STOPS: [10e3, 25e3, 100e3, 250e3],
    LIVE_API_PATH: 'https://api.0x.org/swap/v0/quote',
};
