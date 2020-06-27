// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6;

contract TransformerDeployer {

    function deploy(bytes memory deployData) public payable returns (address a) {
        assembly {
            a := create(callvalue(), add(deployData, 32), mload(deployData))
        }
    }
}
