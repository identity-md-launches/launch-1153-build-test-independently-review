// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IIntake} from "../../src/OracleAdapter.sol";

/// @dev Records requests, pulls the price, and can deliver a callback from its own address.
contract MockIntake is IIntake {
    uint256 public count;
    bytes32 public lastAction;
    bytes public lastBody;
    Callback public lastCallback;
    uint256 public lastAmount;

    function priceOf(bytes32, address) external pure returns (uint256) {
        return 0.5 ether;
    }

    function request(bytes32 action, bytes calldata body, Callback calldata callback, address asset, uint256 amount)
        external
        payable
        returns (bytes32 requestId)
    {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        count += 1;
        lastAction = action;
        lastBody = body;
        lastCallback = callback;
        lastAmount = amount;
        requestId = keccak256(abi.encode(count));
    }

    function deliver(bytes memory data) external returns (bool ok) {
        (ok,) = lastCallback.target.call{gas: 200_000}(abi.encodePacked(lastCallback.selector, data));
    }
}
