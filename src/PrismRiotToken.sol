// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Prism Riot (PRIO), the launch token
/// @notice The platform's standard fixed-supply token: 1,000,000,000 PRIO at 18 decimals, minted once to
/// the deployer (the launch factory), plain transfers, no owner, no mint, no pause, no fee, no upgrade.
/// The 0.5% ETH fee the brief asks for lives in `TreasuryFeeHook`, never here.
contract PrismRiotToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    constructor() ERC20("Prism Riot", "PRIO") {
        _mint(msg.sender, TOTAL_SUPPLY);
    }
}
