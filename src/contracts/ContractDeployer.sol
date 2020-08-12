// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6;
pragma experimental ABIEncoderV2;

contract ContractDeployer {

    struct DeployData {
        bytes data;
        uint256 value;
    }

    function deploy(DeployData[] memory deployDatas)
        public
        payable
        returns (address[] memory addrs)
    {
        addrs = new address[](deployDatas.length);
        for (uint256 i = 0; i < deployDatas.length; ++i) {
            bytes memory data = deployDatas[i].data;
            uint256 value = deployDatas[i].value;
            address a;
            assembly {
                a := create(value, add(data, 32), mload(data))
            }
            if (a == address(0)) {
                revert('ContractDeployer/DEPLOY_FAILED');
            }
            addrs[i] = a;
        }
    }
}
