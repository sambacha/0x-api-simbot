#0x-api-simbot

Perform loads of swaps against the live 0x-api swap/quote endpoint.
Requires geth `eth_call` support (which Infura apparently has now).

## Running
```bash
NODE_RPC=YOUR_GETH_RPC_URL yarn start --output SWAPS_OUTPUT_FILE.json
```

## Analytics
There are a bunch of analysis scripts in the `/py` folder. Just run them directly, passing the swap output file in.
