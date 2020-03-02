pragma solidity ^0.6;
pragma experimental ABIEncoderV2;

import './IERC20.sol';
import './HackedWallet.sol';
import './HackedExchange.sol';

contract MarketCallTaker {

    address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    struct FillParams {
        address payable to;
        IERC20 makerToken;
        IERC20 takerToken;
        HackedWallet wallet;
        address spender;
        IExchange exchange;
        HackedExchange hackedExchange;
        bytes data;
    }

    struct SwapResult {
        uint256 boughtAmount;
        HackedExchange.FillInfo[] fills;
        bytes revertData;
        uint256 gasLeft;
    }

    function fill(FillParams calldata params)
        external payable
        returns (SwapResult memory swapResult)
    {
        params.hackedExchange.__setImplementation(address(params.exchange));
        if (address(params.takerToken) != WETH) {
            params.wallet.pullTokens(address(params.takerToken));
            (bool success, bytes memory result) =
                address(params.takerToken).call(abi.encodeWithSelector(
                    IERC20.approve.selector,
                    params.spender,
                    uint256(-1)
                ));
            if (!success) {
                assembly { revert(add(result, 32), mload(result)) }
            }
        }
        (bool success, bytes memory callResult) =
            params.to.call.value(msg.value)(params.data);
        if (!success) {
            swapResult.revertData = callResult;
        } else {
            swapResult.boughtAmount = params.makerToken.balanceOf(address(this));
        }
        swapResult.fills = params.hackedExchange.getFillInfos();
        swapResult.gasLeft = gasleft();
    }

    receive() payable external {}

    function tokenFallback(address owner, uint256 amount, bytes calldata data) external {}

    function tokensToSend(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    ) external {}

    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata data,
        bytes calldata operatorData
    ) external {}
}
