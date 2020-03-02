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

contract HackedExchange {

    struct FillInfo {
        IExchange.OrderInfo orderInfo;
        IExchange.FillResults fillResults;
        bytes revertData;
    }

    mapping(bytes32 => bytes32) private _stash;
    mapping(bytes32 => FillInfo) private _fillInfos;

    function __setImplementation(address impl) external {
        _stash[keccak256('__impl')] = bytes32(uint256(impl));
    }

    fallback() payable external {
        (bool success, bytes memory result) = _getImpl().delegatecall(msg.data);
        if (!success) {
            assembly { revert(add(result, 32), mload(result)) }
        }
        assembly { return(add(result, 32), mload(result)) }
    }

    receive() payable external {}

    function fillOrder(
        IExchange.Order calldata order,
        uint256,
        bytes calldata
    )
        external
        payable
        returns (IExchange.FillResults memory fillResults)
    {
        address impl = _getImpl();
        uint256 fillCount = uint256(_stash[keccak256('__fillCount')]);
        FillInfo memory fillInfo;
        fillInfo.orderInfo = IExchange(impl).getOrderInfo(order);
        (bool success, bytes memory result) = impl.delegatecall(msg.data);
        if (!success) {
            fillInfo.revertData = result;
        } else {
            fillResults = abi.decode(result, (IExchange.FillResults));
        }
        fillInfo.fillResults = fillResults;
        _fillInfos[keccak256(abi.encode('__fillInfo', fillCount))] = fillInfo;
        _stash[keccak256('__fillCount')] =
            bytes32(uint256(_stash[keccak256('__fillCount')]) + 1);
    }

    function getFillInfos() external view returns (FillInfo[] memory fillInfos) {
        uint256 count = uint256(_stash[keccak256('__fillCount')]);
        fillInfos = new FillInfo[](count);
        for (uint256 i = 0; i < count; ++i) {
            fillInfos[i] = _fillInfos[keccak256(abi.encode('__fillInfo', i))];
        }
    }

    function _getImpl() private view returns (address) {
        return address(uint160(uint256(_stash[keccak256('__impl')])));
    }
}
