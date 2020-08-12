// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6;
pragma experimental ABIEncoderV2;

contract TransformerDeployer {
    function deploy(bytes[] memory transformersDeployData)
        public
        payable
        returns (address[] memory addrs)
    {
        addrs = new address[](transformersDeployData.length);
        for (uint256 i = 0; i < transformersDeployData.length; ++i) {
            bytes memory deployData = transformersDeployData[i];
            address a;
            assembly {
                a := create(callvalue(), add(deployData, 32), mload(deployData))
            }
            if (a == address(0)) {
                revert('TransformerDeployer/DEPLOY_FAILED');
            }
            addrs[i] = a;
        }
    }
}
