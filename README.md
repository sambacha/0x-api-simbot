# 0x-api-simbot

Perform loads of swaps against the live 0x-api swap/quote endpoint.
Requires geth `eth_call` support (which Infura apparently has now).

## Running
Single source sims:
```bash
NODE_RPC=YOUR_GETH_RPC_URL yarn start {--url SWAP_QUOTE_URL} [--output SWAPS_OUTPUT_FILE.json] {--token SYMBOL}  [--buys]  [--sells] [--v0] [--jobs NUM_CONCURRENT_REQUESTS]
```

Multi-source (A-B) sims:
```bash
NODE_RPC=YOUR_GETH_RPC_URL yarn start-ab {--url SWAP_QUOTE_URL} [--output SWAPS_OUTPUT_FILE.json] {--token SYMBOL} [--buys]  [--sells] [--v0] [--jobs NUM_CONCURRENT_REQUESTS]
```

### Command Line Options
| option | description |
|--------|-------------|
| `--url URL`    | The swap-quote API url. Can be repeated for ex: `https://api.0x.org/swap/v0/quote`. |
| `--output FILE` | JSON file to append sim data to. The python analytics tools can parse this file. |
| `--token TOKEN`  | Tokens to include in the simulations. Can be repeated. Defaults are `WETH`, `DAI`, `USDC`. |
| `--jobs N` | Number of concurrent requests to make. Default is `1`, which is very slow. |
| `--buys` | Whether to only do buy swaps. Default is both. |
| `--sells` | Whether to only do sells swaps. Default is both. |
| `--v0` | Whether to run in v0 (non-Exchange Proxy) compat mode. This will prevent swaps to ETH. |

## Analytics
There are a bunch of analysis scripts in the `/py` folder. Just run them directly, passing the swap output file in.


## Configuration
The first time simbot is run (through `start` or `start-ab`) a `config.json` file will be created in the root. You can configure certain addresses and contract overrides from this file.

Example:
```js
{
    "erc20Proxy": "0x95e6f48254609a6ee006f7d493c8e5fb97094cef",
    "exchange": "0x61935cbdd02287b511119ddb11aeb42f1593b7ef",
    "forwarder": "0x6958f5e95332d93d21af0d7b9ca85b8212fee0a5",
    "taker": "0xd00d00caca000000000000000000000000001337",
    "transformers": {
        "deployer": "0x80a36559ab9a497fb658325ed771a584eb0f13da",
        // Transformers that have constructor-defined immutable state have to be
        // hot-redeployed so they must be declared by deployer nonce, not address.
        "overridesByNonce": {
            "3": {
                "artifactPath": "../0x-monorepo/contracts/zero-ex/test/generated-artifacts/FillQuoteTransformer.json",
                "constructorArgs": ["0x61935cbdd02287b511119ddb11aeb42f1593b7ef"],
                "balance": 0
            }
        }
    },
    // Contracts without immutable state and share the same initialization code
    // can simply be overridden.
    "overrides": {
        "0x95e6f48254609a6ee006f7d493c8e5fb97094cef": {
            "artifactPath": "../0x-monorepo/contracts/asset-proxy/test/generated-artifacts/ERC20Proxy.json",
            "balance": 0,
            "nonce": 1
        }
    }
}

```
