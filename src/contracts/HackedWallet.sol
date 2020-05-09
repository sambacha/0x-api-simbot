pragma solidity ^0.6;

import './IERC20.sol';
import './LibERC20Token.sol';

contract HackedWallet {

    using LibERC20Token for IERC20;

    function pullTokens(IERC20 token) external {
        token.compatTransfer(msg.sender, token.balanceOf(address(this)));
    }

    function pullEther() external {
        msg.sender.transfer(address(this).balance);
    }
}
