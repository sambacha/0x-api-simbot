'use strict'

const TOKENS = {
    'ETH': {
        decimals: 18,
        address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        wallet: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
        value: 235,
        cgId: 'weth',
    },
    'WETH': {
        decimals: 18,
        address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        wallet: '0x57757e3d981446d585af0d9ae4d7df6d64647806',
        value: 235,
        cgId: 'weth',
    },
    'DAI': {
        decimals: 18,
        address: '0x6b175474e89094c44da98b954eedeac495271d0f',
        wallet: '0x07bb41df8c1d275c4259cdd0dbf0189d6a9a5f32',
        value: 1,
        cgId: 'dai',
    },
    'USDC': {
        decimals: 6,
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        wallet: '0xf977814e90da44bfa03b6295a0616a897441acec',
        value: 1,
        cgId: 'usd-coin',
    },
    'MKR': {
        decimals: 18,
        address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
        wallet: '0x000be27f560fef0253cac4da8411611184356549',
        value: 615,
        cgId: 'maker',
    },
    'ZRX': {
        decimals: 18,
        address: '0xe41d2489571d322189246dafa5ebde1f4699f498',
        wallet: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
        value: 0.36,
        cgId: '0x',
    },
    'LINK': {
        decimals: 18,
        address: '0x514910771af9ca656af840dff83e8264ecf986ca',
        wallet: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
        value: 4.06,
        cgId: 'chainlink',
    },
    'USDT': {
        decimals: 6,
        address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        wallet: '0x28f635f5f4373559e1db437d7002d386cf718338',
        value: 1,
        cgId: 'usdt',
    },
    'WBTC': {
        decimals: 8,
        address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        wallet: '0xc11b1268c1a384e55c48c2391d8d480264a3a7f4',
        value: 9389,
        cgId: 'wrapped-bitcoin',
    },
    'KNC': {
        decimals: 18,
        address: '0xdd974d5c2e2928dea5f71b9825b8b646686bd200',
        wallet: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
        value: 1.17,
        cgId: 'kyber-network',
    }
};

module.exports = TOKENS;
