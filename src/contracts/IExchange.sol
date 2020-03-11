pragma solidity ^0.6;
pragma experimental ABIEncoderV2;

import './IERC20.sol';

interface IExchange {

    struct Order {
        address makerAddress;
        address takerAddress;
        address feeRecipientAddress;
        address senderAddress;
        uint256 makerAssetAmount;
        uint256 takerAssetAmount;
        uint256 makerFee;
        uint256 takerFee;
        uint256 expirationTimeSeconds;
        uint256 salt;
        bytes makerAssetData;
        bytes takerAssetData;
        bytes makerFeeAssetData;
        bytes takerFeeAssetData;
    }

    enum OrderStatus {
        INVALID,
        INVALID_MAKER_ASSET_AMOUNT,
        INVALID_TAKER_ASSET_AMOUNT,
        FILLABLE,
        EXPIRED,
        FULLY_FILLED,
        CANCELLED
    }

    struct OrderInfo {
        OrderStatus orderStatus;
        bytes32 orderHash;
        uint256 orderTakerAssetFilledAmount;
    }

    struct FillResults {
        uint256 makerAssetFilledAmount;
        uint256 takerAssetFilledAmount;
        uint256 makerFeePaid;
        uint256 takerFeePaid;
        uint256 protocolFeePaid;
    }

    function getOrderInfo(Order calldata order)
        external view returns (OrderInfo memory);
}
