// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6;
pragma experimental ABIEncoderV2;

import './IERC20.sol';
import './HackedWallet.sol';
import './IExchange.sol';
import './LibERC20Token.sol';
import './IWETH.sol';
import './TransformerDeployer.sol';

contract MarketCallTaker {

    IWETH private constant WETH = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IERC20 private constant ETH = IERC20(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);

    struct FillParams {
        address payable to;
        IERC20 makerToken;
        IERC20 takerToken;
        HackedWallet wallet;
        uint256 sellAmount;
        uint256 protocolFeeAmount;
        address spender;
        IExchange exchange;
        bytes data;
        IExchange.Order[] orders;
        TransformerDeployer transformerDeployer;
        bytes[] transformersDeployData;
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

    using LibERC20Token for IERC20;

    function fill(FillParams calldata params)
        external
        payable
        returns (SwapResult memory swapResult)
    {
        require(params.protocolFeeAmount <= msg.value, "INSUFFICIENT_ETH_FOR_FEES");

        swapResult.blockNumber = uint32(block.number);

        uint256 takerBalanceBefore = 0;
        if (params.takerToken == ETH) {
            takerBalanceBefore = msg.value - params.protocolFeeAmount;
        } else {
            params.wallet.pullTokens(params.takerToken, params.sellAmount);
            takerBalanceBefore = params.takerToken.balanceOf(address(this));
            params.takerToken.approveIfBelow(params.spender, takerBalanceBefore);
        }

        swapResult.orderInfos = new IExchange.OrderInfo[](params.orders.length);
        for (uint256 i = 0; i < params.orders.length; ++i) {
            swapResult.orderInfos[i] = IExchange(params.exchange)
                .getOrderInfo(params.orders[i]);
        }

        if (params.transformersDeployData.length > 0) {
            params.transformerDeployer.deploy(params.transformersDeployData);
        }

        swapResult.gasStart = gasleft();
        (bool success, bytes memory callResult) =
            params.to.call{value: msg.value}(params.data);
        swapResult.gasEnd = gasleft();

        if (!success) {
            swapResult.revertData = callResult;
        } else {
            if (params.makerToken == ETH) {
                swapResult.boughtAmount = address(this).balance;
                swapResult.boughtAmount =
                    swapResult.boughtAmount <= params.protocolFeeAmount
                    ? 0 : swapResult.boughtAmount - params.protocolFeeAmount;
            } else {
                swapResult.boughtAmount = params.makerToken.balanceOf(address(this));
            }
            if (params.takerToken == ETH) {
                // Refunds can make this all wrong.
                swapResult.soldAmount = takerBalanceBefore
                    - address(this).balance + params.protocolFeeAmount;
            } else {
                swapResult.soldAmount = takerBalanceBefore -
                    params.takerToken.balanceOf(address(this));
            }
        }
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
