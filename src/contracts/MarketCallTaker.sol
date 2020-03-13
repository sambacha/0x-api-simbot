pragma solidity ^0.6;
pragma experimental ABIEncoderV2;

import './IERC20.sol';
import './HackedWallet.sol';
import './IExchange.sol';

contract MarketCallTaker {

    address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    struct FillParams {
        address payable to;
        IERC20 makerToken;
        IERC20 takerToken;
        HackedWallet wallet;
        address spender;
        IExchange exchange;
        bytes data;
        IExchange.Order[] orders;
    }

    struct SwapResult {
        uint256 boughtAmount;
        uint256 soldAmount;
        IExchange.OrderInfo[] orderInfos;
        bytes revertData;
        uint32 blockNumber;
        uint256 gasStart;
        uint256 gasEnd;
    }

    function fill(FillParams calldata params)
        external payable
        returns (SwapResult memory swapResult)
    {
        uint256 takerBalanceBefore = 0;
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
            takerBalanceBefore = params.takerToken.balanceOf(address(this));
        } else {
            takerBalanceBefore = address(this).balance;
        }
        swapResult.orderInfos = new IExchange.OrderInfo[](params.orders.length);
        for (uint256 i = 0; i < params.orders.length; ++i) {
            swapResult.orderInfos[i] = IExchange(params.exchange).getOrderInfo(params.orders[i]);
        }
        swapResult.gasStart = gasleft();
        (bool success, bytes memory callResult) =
            params.to.call.value(address(this).balance)(params.data);
        swapResult.gasEnd = gasleft();
        if (!success) {
            swapResult.revertData = callResult;
        } else {
            swapResult.boughtAmount = params.makerToken.balanceOf(address(this));
        }
        if (address(params.takerToken) != WETH) {
            swapResult.soldAmount = takerBalanceBefore - params.takerToken.balanceOf(address(this));
        } else {
            swapResult.soldAmount = takerBalanceBefore - address(this).balance;
        }
        swapResult.blockNumber = uint32(block.number);
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
