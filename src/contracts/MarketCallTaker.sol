pragma solidity ^0.6;
pragma experimental ABIEncoderV2;

import './IERC20.sol';
import './HackedWallet.sol';
import './IExchange.sol';
import './LibERC20Token.sol';
import './IWETH.sol';
import './FullMigration.flat.sol';
import './Transformers.flat.sol';

interface IZeroEx {
    function getAllowanceTarget() external view returns (address);
    function createFreePuppet()
        external
        returns (address puppet);
}

contract MarketCallTaker {

    IWETH private constant WETH = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IERC20 private constant ETH = IERC20(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);
    IExchange private constant EXCHANGE = IExchange(0x61935CbDd02287B511119DDb11Aeb42F1593b7Ef);

    struct FillParams {
        address payable to;
        IERC20 makerToken;
        IERC20 takerToken;
        HackedWallet wallet;
        uint256 protocolFeeAmount;
        address spender;
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

    using LibERC20Token for IERC20;

    function fill(FillParams memory params)
        public
        payable
        returns (SwapResult memory swapResult)
    {
        if (params.spender == address(1)) {
            params.spender = _deployZeroEx().getAllowanceTarget();
        }

        require(params.protocolFeeAmount <= msg.value, "INSUFFICIENT_ETH_FOR_FEES");

        swapResult.blockNumber = uint32(block.number);

        uint256 takerBalanceBefore = 0;
        if (params.takerToken == ETH) {
            takerBalanceBefore = msg.value - params.protocolFeeAmount;
        } else {
            params.wallet.pullTokens(params.takerToken);
            takerBalanceBefore = params.takerToken.balanceOf(address(this));
            params.takerToken.approveIfBelow(params.spender, takerBalanceBefore);
        }

        swapResult.orderInfos = new IExchange.OrderInfo[](params.orders.length);
        for (uint256 i = 0; i < params.orders.length; ++i) {
            swapResult.orderInfos[i] = EXCHANGE
                .getOrderInfo(params.orders[i]);
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
                swapResult.soldAmount = takerBalanceBefore - address(this).balance;
                swapResult.soldAmount =
                    swapResult.soldAmount <= params.protocolFeeAmount
                    ? 0 : swapResult.soldAmount - params.protocolFeeAmount;
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

    function _deployZeroEx() private returns (IZeroEx) {
        FullMigration migration = new FullMigration(
            address(this),
            FullMigration.Features(
                new SimpleFunctionRegistry(),
                new Ownable(),
                new TokenSpender(),
                new PuppetPool(),
                new TransformERC20()
            )
        );
        new WethTransformer(IEtherTokenV06(address(WETH)));
        new PayTakerTransformer();
        new FillQuoteTransformer(EXCHANGE);
        IZeroEx zrx = IZeroEx(address(migration.deploy(address(this))));
        zrx.createFreePuppet();
        return zrx;
    }
}
