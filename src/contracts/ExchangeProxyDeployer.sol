// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6;
pragma experimental ABIEncoderV2;

import '@0x/contracts-zero-ex/contracts/src/migrations/FullMigration.sol';
import '@0x/contracts-zero-ex/contracts/src/features/Ownable.sol';
import '@0x/contracts-zero-ex/contracts/src/features/SimpleFunctionRegistry.sol';
import '@0x/contracts-zero-ex/contracts/src/features/TokenSpender.sol';
import '@0x/contracts-zero-ex/contracts/src/features/TransformERC20.sol';
import '@0x/contracts-zero-ex/contracts/src/features/TransformERC20.sol';
import '@0x/contracts-zero-ex/contracts/src/transformers/FillQuoteTransformer.sol';
import '@0x/contracts-zero-ex/contracts/src/transformers/WethTransformer.sol';
import '@0x/contracts-zero-ex/contracts/src/transformers/PayTakerTransformer.sol';

contract ExchangeProxyDeployer {

    address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address private constant EXCHANGE = 0x61935CbDd02287B511119DDb11Aeb42F1593b7Ef;

    struct DeployedAddresses {
        address zeroEx;
        address wethTransformer;
        address payTakerTransformer;
        address fillQuoteTransformer;
    }

    receive() external payable {}

    function deploy() external returns (DeployedAddresses memory addrs) {
        ZeroEx zeroEx = new FullMigration(address(this)).deploy(
            address(this),
            FullMigration.Features({
                registry: new SimpleFunctionRegistry(),
                ownable: new Ownable(),
                tokenSpender: new TokenSpender(),
                transformERC20: new TransformERC20()
            }),
            FullMigration.MigrateOpts({ transformerDeployer: address(this) })
        );
        // Transformers.
        addrs.wethTransformer = address(new WethTransformer(IEtherTokenV06(WETH)));
        addrs.payTakerTransformer = address(new PayTakerTransformer());
        addrs.fillQuoteTransformer = address(new FillQuoteTransformer(IExchange(EXCHANGE)));
        addrs.zeroEx = address(zeroEx);
    }
}
