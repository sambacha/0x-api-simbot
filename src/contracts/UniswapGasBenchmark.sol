// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6;
pragma experimental ABIEncoderV2;

import './IERC20.sol';
import './HackedGovernor.sol';
import './HackedWallet.sol';
import './IExchange.sol';
import './LibERC20Token.sol';
import './IWETH.sol';
import './TransformerDeployer.sol';
import './ContractDeployer.sol';

interface IDirectUniswap {
    function uniswap(
        address to,
        address haveToken,
        address wantToken,
        uint256 haveAmount
    ) external;
}

interface IAsmUniswap {
    function uniswapDaiWeth(uint112 sellAmount) external;
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

contract UniswapGasBenchmark {
    struct BenchmarkResult {
        uint256 directGas;
        uint256 directBypassGas;
        uint256 asmGas;
        uint256 asmBypassGas;
        uint256 uniswapRouter02Gas;
    }

    IERC20 constant DAI = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    IERC20 constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    HackedGovernor constant GOVERNOR = HackedGovernor(0x618F9C67CE7Bf1a50afa1E7e0238422601b0ff6e);
    address constant ALLOWANCE_TARGET = 0xF740B67dA229f2f10bcBd38A7979992fCC71B8Eb;
    address constant ZERO_EX = 0xDef1C0ded9bec7F1a1670819833240f027b25EfF;
    address constant DIRECT_UNISWAP = 0xc0FFee0000000000000000000000000000000000;
    address constant ASM_UNISWAP = 0xDeCAf00000000000000000000000000000000000;
    address constant UNISWAPV2_ROUTER02 = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;

    using LibERC20Token for IERC20;

    function benchmark(address daiWallet, uint256 sellAmount)
        external
        payable
        returns (BenchmarkResult memory benchmarkResult)
    {
        HackedWallet(daiWallet).pullTokens(DAI, sellAmount * 6);
        DAI.approveIfBelow(ALLOWANCE_TARGET, uint256(-1));
        DAI.approveIfBelow(UNISWAPV2_ROUTER02, uint256(-1));
        GOVERNOR.register(IDirectUniswap.uniswap.selector, DIRECT_UNISWAP);
        GOVERNOR.register(IAsmUniswap.uniswapDaiWeth.selector, ASM_UNISWAP);
        GOVERNOR.authorize(DIRECT_UNISWAP);
        GOVERNOR.authorize(ASM_UNISWAP);

        IDirectUniswap(ZERO_EX).uniswap(
            address(this),
            address(DAI),
            address(WETH),
            sellAmount
        );

        uint256 gasStart = gasleft();
        IDirectUniswap(ZERO_EX).uniswap(
            address(this),
            address(DAI),
            address(WETH),
            sellAmount
        );
        benchmarkResult.directGas = gasStart - gasleft();

        gasStart = gasleft();
        IDirectUniswap(DIRECT_UNISWAP).uniswap(
            address(this),
            address(DAI),
            address(WETH),
            sellAmount
        );
        benchmarkResult.directBypassGas = gasStart - gasleft();

        gasStart = gasleft();
        IAsmUniswap(ZERO_EX).uniswapDaiWeth(uint112(sellAmount));
        benchmarkResult.asmGas = gasStart - gasleft();

        gasStart = gasleft();
        IAsmUniswap(ASM_UNISWAP).uniswapDaiWeth(uint112(sellAmount));
        benchmarkResult.asmBypassGas = gasStart - gasleft();

        address[] memory path = new address[](2);
        path[0] = address(DAI);
        path[1] = address(WETH);
        gasStart = gasleft();
        IUniswapV2Router(UNISWAPV2_ROUTER02).swapExactTokensForTokens(
            sellAmount,
            0,
            path,
            address(this),
            block.timestamp
        );
        benchmarkResult.uniswapRouter02Gas = gasStart - gasleft();
    }
}
