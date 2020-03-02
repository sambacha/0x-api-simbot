pragma solidity ^0.6;

import './IERC20.sol';

contract HackedWallet {

    function pullTokens(address token) external {
        (bool success, bytes memory result) = token.call(abi.encodeWithSelector(
            IERC20.transfer.selector,
            msg.sender,
            IERC20(token).balanceOf(address(this))
        ));
        if (!success) {
            assembly { revert(add(result, 32), mload(result)) }
        }
    }

    function pullEther() external {
        msg.sender.transfer(address(this).balance);
    }
}
