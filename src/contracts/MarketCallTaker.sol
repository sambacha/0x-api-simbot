// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6;
pragma experimental ABIEncoderV2;

import './IERC20.sol';
import './HackedWallet.sol';
import './IExchange.sol';
import './LibERC20Token.sol';
import './IWETH.sol';
import './TransformerDeployer.sol';

interface IAllowance {
    function setAllowances()
        external;
}

contract MarketCallTaker {

    IWETH private constant WETH = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IERC20 private constant ETH = IERC20(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);
    address private constant ZEROEX_PROTOCOL_FEE_COLLECTOR = 0xa26e80e7Dea86279c6d778D702Cc413E6CFfA777;

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
        bytes revertData;
        uint32 blockNumber;
        uint256 gasStart;
        uint256 gasEnd;
        uint256 ethBalance;
        uint256 protocolFeePaid;
    }

    using LibERC20Token for IERC20;

    function fill(FillParams calldata params)
        external
        payable
        returns (SwapResult memory swapResult)
    {
        // Initialize allowances on the flash-wallet to avoid unecessary gas overhead.
        try IAllowance(0x22F9dCF4647084d6C31b2765F6910cd85C178C18).setAllowances() {}
        catch (bytes memory) {}

        require(params.protocolFeeAmount <= msg.value, "INSUFFICIENT_ETH_FOR_FEES");
        uint256 feeCollectorBalanceBefore = _protocolFeeCollectorBalance();

        swapResult.blockNumber = uint32(block.number);

        uint256 takerBalanceBefore = 0;
        if (params.takerToken == ETH) {
            takerBalanceBefore = msg.value - params.protocolFeeAmount;
        } else {
            params.wallet.pullTokens(params.takerToken, params.sellAmount);
            takerBalanceBefore = params.takerToken.balanceOf(address(this));
            params.takerToken.approveIfBelow(params.spender, takerBalanceBefore);
        }

        if (params.transformersDeployData.length > 0) {
            params.transformerDeployer.deploy(params.transformersDeployData);
        }

        swapResult.gasStart = gasleft();
        (bool success, bytes memory callResult) =
            params.to.call{value: msg.value}(params.data);
        swapResult.gasEnd = gasleft();
        swapResult.protocolFeePaid = _protocolFeeCollectorBalance() - feeCollectorBalanceBefore;

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
        swapResult.ethBalance = address(this).balance;
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

    function _protocolFeeCollectorBalance()
        private
        view
        returns (uint256 balance)
    {
        balance = WETH.balanceOf(ZEROEX_PROTOCOL_FEE_COLLECTOR);
        balance += ZEROEX_PROTOCOL_FEE_COLLECTOR.balance;
        return balance;
    }
}
