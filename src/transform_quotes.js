'use strict'
const FlexContract = require('flex-contract');
const AbiEncoder = require('web3-eth-abi');
const BigNumber = require('bignumber.js');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const {
    ITransformERC20Contract,
} = require('@0x/contracts-zero-ex/lib/test/generated-wrappers/i_transform_erc20.js');
const {
    TestFillQuoteTransformerHelperContract,
} = require('@0x/contracts-zero-ex/lib/test/generated-wrappers/test_fill_quote_transformer_helper.js');

const TOKENS = require('./tokens');
const ADDRESSES = require('./pseudo-addresses');
const NULL_ADDRESS = '0x' + _.repeat('0', 40);
const ZERO_AMOUNT = new BigNumber(0);
const FAKE_PROVIDER = {
    sendAsync() {}
};
const FQT_HELPER = new TestFillQuoteTransformerHelperContract(
    NULL_ADDRESS,
    FAKE_PROVIDER,
    {},
    {},
);
const TRANSFORM_ERC20 = new ITransformERC20Contract(
    NULL_ADDRESS,
    FAKE_PROVIDER,
    {},
    {},
);
const MAX_UINT256 = new BigNumber(2).pow(256).minus(1);
const NULL_BYTES = '0x';

function toTransformQuote(quote) {
    const { makerToken, takerToken } = quote.metadata;
    const transformations = [];
    let fillToken = takerToken;
    if (takerToken === 'ETH') {
        transformations.push({
            transformer: ADDRESSES.WETH_TRANSFORMER_ADDRESS,
            tokens: [TOKENS[takerToken].address],
            amounts: [new BigNumber(quote.sellAmount)],
            data: NULL_BYTES,
        });
        fillToken = 'WETH';
    }
    transformations.push({
        transformer: ADDRESSES.FILL_QUOTE_TRANSFORMER_ADDRESS,
        tokens: [TOKENS[fillToken].address, TOKENS['ETH'].address],
        amounts: [new BigNumber(quote.sellAmount), new BigNumber(quote.protocolFee)],
        data: encodeFillQuoteTranformerData({
            sellToken: TOKENS[fillToken].address,
            buyToken: TOKENS[makerToken].address,
            orders: quote.orders,
            sellAmount: new BigNumber(quote.sellAmount),
        }),
    });
    transformations.push({
        transformer: ADDRESSES.PAY_TAKER_TRANSFORMER_ADDRESS,
        tokens: [TOKENS[makerToken].address, TOKENS['ETH'].address],
        amounts: [MAX_UINT256, MAX_UINT256],
        data: NULL_BYTES,
    });
    const callData = TRANSFORM_ERC20.transformERC20(
        TOKENS[takerToken].address,
        TOKENS[makerToken].address,
        new BigNumber(quote.sellAmount),
        ZERO_AMOUNT,
        transformations,
    ).getABIEncodedTransactionData();
    return {
        ...quote,
        spender: '0x0000000000000000000000000000000000000001',
        to: ADDRESSES.ZERO_EX_ADDRESS,
        data: callData,
    };
}

function encodeFillQuoteTranformerData(opts) {
    return '0x' + FQT_HELPER.encodeTransformData({
        maxOrderFillAmounts: [],
        buyAmount: ZERO_AMOUNT,
        signatures: opts.orders.map(o => o.signature),
        ...opts,
    }).getABIEncodedTransactionData().slice(10);
}

module.exports = {
    toTransformQuote,
};
