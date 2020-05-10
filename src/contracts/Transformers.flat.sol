pragma solidity ^0.6.5;
pragma experimental ABIEncoderV2;

import './FullMigration.flat.sol';
import './IExchange.sol';

interface IEtherTokenV06 is
    IERC20TokenV06
{
    /// @dev Wrap ether.
    function deposit() external payable;

    /// @dev Unwrap ether.
    function withdraw(uint256 amount) external;
}

library LibMathRichErrorsV06 {

    // bytes4(keccak256("DivisionByZeroError()"))
    bytes internal constant DIVISION_BY_ZERO_ERROR =
        hex"a791837c";

    // bytes4(keccak256("RoundingError(uint256,uint256,uint256)"))
    bytes4 internal constant ROUNDING_ERROR_SELECTOR =
        0x339f3de2;

    // solhint-disable func-name-mixedcase
    function DivisionByZeroError()
        internal
        pure
        returns (bytes memory)
    {
        return DIVISION_BY_ZERO_ERROR;
    }

    function RoundingError(
        uint256 numerator,
        uint256 denominator,
        uint256 target
    )
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(
            ROUNDING_ERROR_SELECTOR,
            numerator,
            denominator,
            target
        );
    }
}

library LibReentrancyGuardRichErrorsV06 {

    // bytes4(keccak256("IllegalReentrancyError()"))
    bytes internal constant ILLEGAL_REENTRANCY_ERROR_SELECTOR_BYTES =
        hex"0c3b823f";

    // solhint-disable func-name-mixedcase
    function IllegalReentrancyError()
        internal
        pure
        returns (bytes memory)
    {
        return ILLEGAL_REENTRANCY_ERROR_SELECTOR_BYTES;
    }
}

contract ReentrancyGuardV06 {

    // Locked state of mutex.
    bool private _locked = false;

    /// @dev Functions with this modifer cannot be reentered. The mutex will be locked
    ///      before function execution and unlocked after.
    modifier nonReentrant() {
        _lockMutexOrThrowIfAlreadyLocked();
        _;
        _unlockMutex();
    }

    function _lockMutexOrThrowIfAlreadyLocked()
        internal
    {
        // Ensure mutex is unlocked.
        if (_locked) {
            LibRichErrorsV06.rrevert(
                LibReentrancyGuardRichErrorsV06.IllegalReentrancyError()
            );
        }
        // Lock mutex.
        _locked = true;
    }

    function _unlockMutex()
        internal
    {
        // Unlock mutex.
        _locked = false;
    }
}

library LibMathV06 {

    using LibSafeMathV06 for uint256;

    /// @dev Calculates partial value given a numerator and denominator rounded down.
    ///      Reverts if rounding error is >= 0.1%
    /// @param numerator Numerator.
    /// @param denominator Denominator.
    /// @param target Value to calculate partial of.
    /// @return partialAmount Partial value of target rounded down.
    function safeGetPartialAmountFloor(
        uint256 numerator,
        uint256 denominator,
        uint256 target
    )
        internal
        pure
        returns (uint256 partialAmount)
    {
        if (isRoundingErrorFloor(
                numerator,
                denominator,
                target
        )) {
            LibRichErrorsV06.rrevert(LibMathRichErrorsV06.RoundingError(
                numerator,
                denominator,
                target
            ));
        }

        partialAmount = numerator.safeMul(target).safeDiv(denominator);
        return partialAmount;
    }

    /// @dev Calculates partial value given a numerator and denominator rounded down.
    ///      Reverts if rounding error is >= 0.1%
    /// @param numerator Numerator.
    /// @param denominator Denominator.
    /// @param target Value to calculate partial of.
    /// @return partialAmount Partial value of target rounded up.
    function safeGetPartialAmountCeil(
        uint256 numerator,
        uint256 denominator,
        uint256 target
    )
        internal
        pure
        returns (uint256 partialAmount)
    {
        if (isRoundingErrorCeil(
                numerator,
                denominator,
                target
        )) {
            LibRichErrorsV06.rrevert(LibMathRichErrorsV06.RoundingError(
                numerator,
                denominator,
                target
            ));
        }

        // safeDiv computes `floor(a / b)`. We use the identity (a, b integer):
        //       ceil(a / b) = floor((a + b - 1) / b)
        // To implement `ceil(a / b)` using safeDiv.
        partialAmount = numerator.safeMul(target)
            .safeAdd(denominator.safeSub(1))
            .safeDiv(denominator);

        return partialAmount;
    }

    /// @dev Calculates partial value given a numerator and denominator rounded down.
    /// @param numerator Numerator.
    /// @param denominator Denominator.
    /// @param target Value to calculate partial of.
    /// @return partialAmount Partial value of target rounded down.
    function getPartialAmountFloor(
        uint256 numerator,
        uint256 denominator,
        uint256 target
    )
        internal
        pure
        returns (uint256 partialAmount)
    {
        partialAmount = numerator.safeMul(target).safeDiv(denominator);
        return partialAmount;
    }

    /// @dev Calculates partial value given a numerator and denominator rounded down.
    /// @param numerator Numerator.
    /// @param denominator Denominator.
    /// @param target Value to calculate partial of.
    /// @return partialAmount Partial value of target rounded up.
    function getPartialAmountCeil(
        uint256 numerator,
        uint256 denominator,
        uint256 target
    )
        internal
        pure
        returns (uint256 partialAmount)
    {
        // safeDiv computes `floor(a / b)`. We use the identity (a, b integer):
        //       ceil(a / b) = floor((a + b - 1) / b)
        // To implement `ceil(a / b)` using safeDiv.
        partialAmount = numerator.safeMul(target)
            .safeAdd(denominator.safeSub(1))
            .safeDiv(denominator);

        return partialAmount;
    }

    /// @dev Checks if rounding error >= 0.1% when rounding down.
    /// @param numerator Numerator.
    /// @param denominator Denominator.
    /// @param target Value to multiply with numerator/denominator.
    /// @return isError Rounding error is present.
    function isRoundingErrorFloor(
        uint256 numerator,
        uint256 denominator,
        uint256 target
    )
        internal
        pure
        returns (bool isError)
    {
        if (denominator == 0) {
            LibRichErrorsV06.rrevert(LibMathRichErrorsV06.DivisionByZeroError());
        }

        // The absolute rounding error is the difference between the rounded
        // value and the ideal value. The relative rounding error is the
        // absolute rounding error divided by the absolute value of the
        // ideal value. This is undefined when the ideal value is zero.
        //
        // The ideal value is `numerator * target / denominator`.
        // Let's call `numerator * target % denominator` the remainder.
        // The absolute error is `remainder / denominator`.
        //
        // When the ideal value is zero, we require the absolute error to
        // be zero. Fortunately, this is always the case. The ideal value is
        // zero iff `numerator == 0` and/or `target == 0`. In this case the
        // remainder and absolute error are also zero.
        if (target == 0 || numerator == 0) {
            return false;
        }

        // Otherwise, we want the relative rounding error to be strictly
        // less than 0.1%.
        // The relative error is `remainder / (numerator * target)`.
        // We want the relative error less than 1 / 1000:
        //        remainder / (numerator * denominator)  <  1 / 1000
        // or equivalently:
        //        1000 * remainder  <  numerator * target
        // so we have a rounding error iff:
        //        1000 * remainder  >=  numerator * target
        uint256 remainder = mulmod(
            target,
            numerator,
            denominator
        );
        isError = remainder.safeMul(1000) >= numerator.safeMul(target);
        return isError;
    }

    /// @dev Checks if rounding error >= 0.1% when rounding up.
    /// @param numerator Numerator.
    /// @param denominator Denominator.
    /// @param target Value to multiply with numerator/denominator.
    /// @return isError Rounding error is present.
    function isRoundingErrorCeil(
        uint256 numerator,
        uint256 denominator,
        uint256 target
    )
        internal
        pure
        returns (bool isError)
    {
        if (denominator == 0) {
            LibRichErrorsV06.rrevert(LibMathRichErrorsV06.DivisionByZeroError());
        }

        // See the comments in `isRoundingError`.
        if (target == 0 || numerator == 0) {
            // When either is zero, the ideal value and rounded value are zero
            // and there is no rounding error. (Although the relative error
            // is undefined.)
            return false;
        }
        // Compute remainder as before
        uint256 remainder = mulmod(
            target,
            numerator,
            denominator
        );
        remainder = denominator.safeSub(remainder) % denominator;
        isError = remainder.safeMul(1000) >= numerator.safeMul(target);
        return isError;
    }
}

/// @dev A transformer that transfers any tokens it receives to the taker.
contract PayTakerTransformer is
    IERC20Transformer
{
    using LibRichErrorsV06 for bytes;
    using LibSafeMathV06 for uint256;
    using LibERC20Transformer for IERC20TokenV06;

    /// @dev Forwards any tokens transffered to the taker.
    /// @param taker The taker address (caller of `TransformERC20.transformERC20()`).
    /// @param tokens The tokens that were transferred to this contract. ETH may
    ///        be included as 0xeee...
    /// @param amounts The amount of each token in `tokens` that were transferred
    ///        to this contract.
    /// @return success `TRANSFORMER_SUCCESS` on success.
    function transform(
        bytes32, // callDataHash,
        address payable taker,
        IERC20TokenV06[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata // data_
    )
        external
        override
        payable
        returns (bytes4 success)
    {
        for (uint256 i = 0; i < amounts.length; ++i) {
            // Transfer tokens directly to the taker.
            if (amounts[i] != 0) {
                tokens[i].transformerTransfer(taker, amounts[i]);
            }
        }
        return LibERC20Transformer.TRANSFORMER_SUCCESS;
    }
}

/// @dev A transformer that wraps or unwraps WETH.
contract WethTransformer is
    IERC20Transformer
{
    // solhint-disable indent

    /// @dev The WETH contract address.
    IEtherTokenV06 public immutable weth;

    using LibRichErrorsV06 for bytes;
    using LibSafeMathV06 for uint256;

    constructor(IEtherTokenV06 weth_) public {
        weth = weth_;
    }

    /// @dev Wraps and unwraps WETH, depending on the token transferred.
    ///      If WETH is transferred, it will be unwrapped to ETH.
    ///      If ETH is transferred, it will be wrapped to WETH.
    /// @param tokens The tokens that were transferred to this contract. ETH may
    ///        be included as 0xeee...
    /// @param amounts The amount of each token in `tokens` that were transferred
    ///        to this contract.
    /// @return success `TRANSFORMER_SUCCESS` on success.
    function transform(
        bytes32, // callDataHash,
        address payable, // taker,
        IERC20TokenV06[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata // data
    )
        external
        override
        payable
        returns (bytes4 success)
    {
        if (tokens.length != 1) {
            LibTransformERC20RichErrors
                .WrongNumberOfTokensReceivedError(tokens.length, 1)
                .rrevert();
        }

        uint256 amount = amounts[0];

        if (LibERC20Transformer.isTokenETH(tokens[0])) {
            // Wrap ETH.
            weth.deposit{value: amount}();
            // Transfer WETH to sender.
            weth.transfer(msg.sender, amount);
        } else if (address(tokens[0]) == address(weth)) {
            // Unwrap WETH.
            weth.withdraw(amount);
            // Transfer ETH to sender.
            msg.sender.transfer(amount);
        } else {
            // Token must be either WETH or ETH.
            LibTransformERC20RichErrors
                .InvalidTokenReceivedError(address(tokens[0]))
                .rrevert();
        }
        return LibERC20Transformer.TRANSFORMER_SUCCESS;
    }

    // solhint-disable
    /// @dev Allow this contract to receive ETH.
    receive() external payable {}
    // solhint-enaable-
}

/// @dev A transformer that fills an ERC20 market sell/buy quote.
contract FillQuoteTransformer is
    IERC20Transformer,
    ReentrancyGuardV06
{
    // solhint-disable indent,no-empty-blocks,no-unused-vars

    /// @dev Data to encode and pass to `transform()`.
    struct FillQuoteTransformData {
        // The token being sold.
        // This should be an actual token, not the ETH pseudo-token.
        IERC20TokenV06 sellToken;
        // The token being bought.
        // This should be an actual token, not the ETH pseudo-token.
        IERC20TokenV06 buyToken;
        // The orders to fill.
        IExchange.Order[] orders;
        // Signatures for each respective order in `orders`.
        bytes[] signatures;
        // Maximum fill amount for each order.
        // For sells, this will be the maximum sell amount (taker asset).
        // For buys, this will be the maximum buy amount (maker asset).
        uint256[] maxOrderFillAmounts;
        // Amount of `sellToken` to sell. May be `uint256(-1)` to sell entire
        // amount of `sellToken` received. Zero if performing a market buy.
        uint256 sellAmount;
        // Amount of `buyToken` to buy. Zero if performing a market sell.
        uint256 buyAmount;
    }

    /// @dev Results of a call to `_fillOrder()`.
    struct FillOrderResults {
        // The amount of taker tokens sold, according to balance checks.
        uint256 takerTokenSoldAmount;
        // The amount of maker tokens sold, according to balance checks.
        uint256 makerTokenBoughtAmount;
        // The amount of protocol fee paid.
        uint256 protocolFeePaid;
    }

    /// @dev The ERC20Proxy ID.
    bytes4 constant private ERC20_ASSET_PROXY_ID = 0xf47261b0;
    /// @dev Received tokens index of the sell token.
    uint256 constant private SELL_TOKEN_IDX = 0;
    /// @dev Received tokens index of the ETH "token" (protocol fees).
    uint256 constant private ETH_TOKEN_IDX = 1;

    /// @dev The Exchange contract.
    IExchange public immutable exchange;
    /// @dev The ERC20Proxy address.
    address public immutable erc20Proxy;

    using LibERC20TokenV06 for IERC20TokenV06;
    using LibSafeMathV06 for uint256;
    using LibRichErrorsV06 for bytes;

    constructor(IExchange exchange_) public {
        exchange = exchange_;
        erc20Proxy = exchange_.getAssetProxy(ERC20_ASSET_PROXY_ID);
    }

    /// @dev Sell this contract's entire balance of of `sellToken` in exchange
    ///      for `buyToken` by filling `orders`. Protocol fees should be attached
    ///      to this call. `buyToken` and excess ETH will be transferred back to the caller.
    ///      This function cannot be re-entered.
    /// @param data_ ABI-encoded `FillQuoteTransformData`.
    /// @return success `TRANSFORMER_SUCCESS` on success.
    function transform(
        bytes32, // callDataHash,
        address payable, // taker,
        IERC20TokenV06[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata data_
    )
        external
        override
        payable
        nonReentrant
        returns (bytes4 success)
    {
        FillQuoteTransformData memory data =
            abi.decode(data_, (FillQuoteTransformData));

        // We expect to receive two tokens: The sell token and ETH for the protocol fee.
        if (tokens.length != 2 ||
            tokens[SELL_TOKEN_IDX] != data.sellToken ||
            !LibERC20Transformer.isTokenETH(tokens[ETH_TOKEN_IDX]))
        {
            LibTransformERC20RichErrors
                .InvalidTokensReceivedError(_asAddressArray(tokens))
                .rrevert();
        }

        // If `sellAmount == -1` and `buyAmount == 0` then we are selling
        // the entire balance of `sellToken`. This is useful in cases where
        // the exact sell amount is not known in advance, like when unwrapping
        // Chai/cUSDC/cDAI.
        if (data.sellAmount == uint256(-1) && data.buyAmount == 0) {
            data.sellAmount = amounts[SELL_TOKEN_IDX];
        }

        // Approve the ERC20 proxy to spend `sellToken`.
        data.sellToken.approveIfBelow(erc20Proxy, data.sellAmount);

        // Fill the orders.
        uint256 singleProtocolFee = exchange.protocolFeeMultiplier().safeMul(tx.gasprice);
        uint256 boughtAmount = 0;
        uint256 soldAmount = 0;
        uint256 protocolFeesPaid = 0;
        for (uint256 i = 0; i < data.orders.length; ++i) {
            // Check if we've hit our targets.
            if (data.buyAmount == 0) {
                // Market sell check.
                if (soldAmount >= data.sellAmount) {
                    break;
                }
            } else {
                // Market buy check.
                if (boughtAmount >= data.buyAmount) {
                    break;
                }
            }

            {
                // Ensure we have enough ETH to cover the protocol fee.
                uint256 remainingETH = amounts[ETH_TOKEN_IDX].safeSub(protocolFeesPaid);
                if (remainingETH < singleProtocolFee) {
                    LibTransformERC20RichErrors
                        .InsufficientProtocolFeeError(remainingETH, singleProtocolFee)
                        .rrevert();
                }
            }

            // Fill the order.
            FillOrderResults memory results;
            if (data.buyAmount == 0) {
                // Market sell.
                results = _sellToOrder(
                    data.buyToken,
                    data.sellToken,
                    data.orders[i],
                    data.signatures[i],
                    data.sellAmount.safeSub(soldAmount).min256(
                        data.maxOrderFillAmounts.length > i
                        ? data.maxOrderFillAmounts[i]
                        : uint256(-1)
                    ),
                    singleProtocolFee
                );
            } else {
                // Market buy.
                results = _buyFromOrder(
                    data.buyToken,
                    data.sellToken,
                    data.orders[i],
                    data.signatures[i],
                    data.buyAmount.safeSub(boughtAmount).min256(
                        data.maxOrderFillAmounts.length > i
                        ? data.maxOrderFillAmounts[i]
                        : uint256(-1)
                    ),
                    singleProtocolFee
                );
            }

            // Accumulate totals.
            soldAmount = soldAmount.safeAdd(results.takerTokenSoldAmount);
            boughtAmount = boughtAmount.safeAdd(results.makerTokenBoughtAmount);
            protocolFeesPaid = protocolFeesPaid.safeAdd(results.protocolFeePaid);
        }

        // Ensure we hit our targets.
        if (data.buyAmount == 0) {
            // Market sell check.
            if (soldAmount < data.sellAmount) {
                LibTransformERC20RichErrors
                    .IncompleteFillSellQuoteError(
                        address(data.sellToken),
                        soldAmount,
                        data.sellAmount
                    ).rrevert();
            }
        } else {
            // Market buy check.
            if (boughtAmount < data.buyAmount) {
                LibTransformERC20RichErrors
                    .IncompleteFillBuyQuoteError(
                        address(data.buyToken),
                        boughtAmount,
                        data.buyAmount
                    ).rrevert();
            }
        }

        // Transfer buy tokens.
        data.buyToken.compatTransfer(msg.sender, boughtAmount);
        {
            // Return unused sell tokens.
            uint256 remainingSellToken = amounts[SELL_TOKEN_IDX].safeSub(soldAmount);
            if (remainingSellToken != 0) {
                data.sellToken.compatTransfer(msg.sender, remainingSellToken);
            }
        }
        {
            // Return unused ETH.
            uint256 remainingETH = amounts[ETH_TOKEN_IDX].safeSub(protocolFeesPaid);
            if (remainingETH != 0) {
                msg.sender.transfer(remainingETH);
            }
        }
        return LibERC20Transformer.TRANSFORMER_SUCCESS;
    }

    // solhint-disable
    /// @dev Allow this contract to receive protocol fee refunds.
    receive() external payable {}
    // solhint-enable

    // Try to sell up to `sellAmount` from an order.
    function _sellToOrder(
        IERC20TokenV06 makerToken,
        IERC20TokenV06 takerToken,
        IExchange.Order memory order,
        bytes memory signature,
        uint256 sellAmount,
        uint256 protocolFee
    )
        private
        returns (FillOrderResults memory results)
    {
        IERC20TokenV06 takerFeeToken = order.takerFeeAssetData.length == 0
            ? IERC20TokenV06(address(0))
            : _getTokenFromERC20AssetData(order.takerFeeAssetData);

        uint256 takerTokenFillAmount = sellAmount;

        if (order.takerFee != 0) {
            if (takerFeeToken == makerToken) {
                // Taker fee is payable in the maker token, so we need to
                // approve the proxy to spend the maker token.
                // It isn't worth computing the actual taker fee
                // since `approveIfBelow()` will set the allowance to infinite. We
                // just need a reasonable upper bound to avoid unnecessarily re-approving.
                takerFeeToken.approveIfBelow(erc20Proxy, order.takerFee);
            } else if (takerFeeToken == takerToken){
                // Taker fee is payable in the taker token, so we need to
                // reduce the fill amount to cover the fee.
                // takerTokenFillAmount' =
                //   (takerTokenFillAmount * order.takerAssetAmount) /
                //   (order.takerAssetAmount + order.takerFee)
                takerTokenFillAmount = LibMathV06.getPartialAmountCeil(
                    order.takerAssetAmount,
                    order.takerAssetAmount.safeAdd(order.takerFee),
                    takerTokenFillAmount
                );
            } else {
                //  Only support taker or maker asset denominated taker fees.
                LibTransformERC20RichErrors.InvalidTakerFeeTokenError(
                    address(takerFeeToken)
                ).rrevert();
            }
        }

        // Clamp fill amount to order size.
        takerTokenFillAmount = LibSafeMathV06.min256(
            takerTokenFillAmount,
            order.takerAssetAmount
        );

        // Perform the fill.
        return _fillOrder(
            order,
            signature,
            takerTokenFillAmount,
            protocolFee,
            makerToken,
            takerFeeToken == takerToken
        );
    }

    /// @dev Try to buy up to `buyAmount` from an order.
    function _buyFromOrder(
        IERC20TokenV06 makerToken,
        IERC20TokenV06 takerToken,
        IExchange.Order memory order,
        bytes memory signature,
        uint256 buyAmount,
        uint256 protocolFee
    )
        private
        returns (FillOrderResults memory results)
    {
        IERC20TokenV06 takerFeeToken = order.takerFeeAssetData.length == 0
            ? IERC20TokenV06(address(0))
            : _getTokenFromERC20AssetData(order.takerFeeAssetData);

        uint256 makerTokenFillAmount = buyAmount;

        if (order.takerFee != 0) {
            if (takerFeeToken == makerToken) {
                // Taker fee is payable in the maker token.
                // Increase the fill amount to account for maker tokens being
                // lost to the taker fee.
                // makerTokenFillAmount' =
                //  (order.makerAssetAmount * makerTokenFillAmount) /
                //  (order.makerAssetAmount - order.takerFee)
                makerTokenFillAmount = LibMathV06.getPartialAmountCeil(
                    order.makerAssetAmount,
                    order.makerAssetAmount.safeSub(order.takerFee),
                    makerTokenFillAmount
                );
                // Approve the proxy to spend the maker token.
                // It isn't worth computing the actual taker fee
                // since `approveIfBelow()` will set the allowance to infinite. We
                // just need a reasonable upper bound to avoid unnecessarily re-approving.
                takerFeeToken.approveIfBelow(erc20Proxy, order.takerFee);
            } else if (takerFeeToken != takerToken) {
                //  Only support taker or maker asset denominated taker fees.
                LibTransformERC20RichErrors.InvalidTakerFeeTokenError(
                    address(takerFeeToken)
                ).rrevert();
            }
        }

        // Convert maker fill amount to taker fill amount.
        uint256 takerTokenFillAmount = LibSafeMathV06.min256(
            order.takerAssetAmount,
            LibMathV06.getPartialAmountCeil(
                makerTokenFillAmount,
                order.makerAssetAmount,
                order.takerAssetAmount
            )
        );

        // Perform the fill.
        return _fillOrder(
            order,
            signature,
            takerTokenFillAmount,
            protocolFee,
            makerToken,
            takerFeeToken == takerToken
        );
    }

    /// @dev Fill an order.
    function _fillOrder(
        IExchange.Order memory order,
        bytes memory signature,
        uint256 takerAssetFillAmount,
        uint256 protocolFee,
        IERC20TokenV06 makerToken,
        bool isTakerFeeInTakerToken
    )
        private
        returns (FillOrderResults memory results)
    {
        // Track changes in the maker token balance.
        results.makerTokenBoughtAmount = makerToken.balanceOf(address(this));
        try
            exchange.fillOrder
                {value: protocolFee}
                (order, takerAssetFillAmount, signature)
            returns (IExchange.FillResults memory fillResults)
        {
            // Update maker quantity based on changes in token balances.
            results.makerTokenBoughtAmount = makerToken.balanceOf(address(this))
                .safeSub(results.makerTokenBoughtAmount);
            // We can trust the other fill result quantities.
            results.protocolFeePaid = fillResults.protocolFeePaid;
            results.takerTokenSoldAmount = fillResults.takerAssetFilledAmount;
            // If the taker fee is payable in the taker asset, include the
            // taker fee in the total amount sold.
            if (isTakerFeeInTakerToken) {
                results.takerTokenSoldAmount =
                    results.takerTokenSoldAmount.safeAdd(fillResults.takerFeePaid);
            }
        } catch (bytes memory) {
            // If the fill fails, zero out fill quantities.
            results.makerTokenBoughtAmount = 0;
        }
    }

    /// @dev Extract the token from plain ERC20 asset data.
    function _getTokenFromERC20AssetData(bytes memory assetData)
        private
        pure
        returns (IERC20TokenV06 token)
    {
        if (assetData.length != 36 &&
            LibBytesV06.readBytes4(assetData, 0) != ERC20_ASSET_PROXY_ID)
        {
            LibTransformERC20RichErrors
                .InvalidERC20AssetDataError(assetData)
                .rrevert();
        }
        return IERC20TokenV06(LibBytesV06.readAddress(assetData, 16));
    }

    /// @dev Cast an array of tokens to an array of addresses.
    function _asAddressArray(IERC20TokenV06[] memory tokens)
        private
        pure
        returns (address[] memory addrs)
    {
        assembly { addrs := tokens }
    }
}
