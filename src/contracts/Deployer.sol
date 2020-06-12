// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6;
pragma experimental ABIEncoderV2;

contract Deployer {

    function deploy(bytes memory deployData)
        public
        returns (address deployedAddress, bytes memory deployedBytecode)
    {
        assembly {
            deployedAddress := create(callvalue(), add(deployData, 32), mload(deployData))
            let s := extcodesize(deployedAddress)
            deployedBytecode := mload(0x40)
            mstore(0x40, add(deployedBytecode, s))
            mstore(deployedBytecode, s)
            extcodecopy(deployedAddress, add(deployedBytecode, 32), 0, s)
        }
    }
}
