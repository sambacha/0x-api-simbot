// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6;

interface IAuthorizable {
    function addAuthorizedAddress(address target) external;
}

interface ISimpleFunctionRegistry {
    function extend(bytes4 selector, address impl) external;
}

contract HackedGovernor {
    address constant ALLOWANCE_TARGET = 0xF740B67dA229f2f10bcBd38A7979992fCC71B8Eb;
    address constant ZERO_EX = 0xDef1C0ded9bec7F1a1670819833240f027b25EfF;

    function register(bytes4 selector, address implementation) external {
        ISimpleFunctionRegistry(ZERO_EX).extend(selector, implementation);
    }

    function authorize(address target) external {
        IAuthorizable(ALLOWANCE_TARGET).addAuthorizedAddress(target);
    }
}
