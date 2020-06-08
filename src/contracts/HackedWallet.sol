// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6;

import './IERC20.sol';
import './LibERC20Token.sol';

contract HackedWallet {

    using LibERC20Token for IERC20;

    function pullTokens(IERC20 token, uint256 amount) external {
        require(token.balanceOf(address(this)) >= amount, 'HackedWallet/INSUFFICIENT_FUNDS');
        token.compatTransfer(msg.sender, amount);
    }

    function pullEther(uint256 amount) external {
        require(address(this).balance >= amount, 'HackedWallet/INSUFFICIENT_FUNDS');
        msg.sender.transfer(amount);
    }
}
