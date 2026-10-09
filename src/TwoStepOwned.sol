// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title Two-step ownership that cannot be renounced
/// @notice Every PRISM RIOT contract is owned by the paying wallet. Ownership moves only when the new owner
/// accepts it, and it can never be renounced: a contract with no owner could never configure a future round
/// or rotate an operator budget, and nothing here needs an ownerless state.
abstract contract TwoStepOwned is Ownable2Step {
    error RenunciationDisabled();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @dev Permanently disabled. See the contract notice.
    function renounceOwnership() public view override onlyOwner {
        revert RenunciationDisabled();
    }
}
