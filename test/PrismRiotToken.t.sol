// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PrismRiotToken} from "../src/PrismRiotToken.sol";

contract PrismRiotTokenTest is Test {
    PrismRiotToken token;

    function setUp() public {
        token = new PrismRiotToken();
    }

    function test_metadataAndSupply() public view {
        assertEq(token.name(), "Prism Riot");
        assertEq(token.symbol(), "PRIO");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 1_000_000_000e18);
        assertEq(token.balanceOf(address(this)), 1_000_000_000e18);
    }

    function test_transferMovesExactly() public {
        address to = makeAddr("to");
        assertTrue(token.transfer(to, 5 ether));
        assertEq(token.balanceOf(to), 5 ether);
        assertEq(token.balanceOf(address(this)), 1_000_000_000e18 - 5 ether);
        assertEq(token.totalSupply(), 1_000_000_000e18);
    }

    function test_noMintOrOwnerFunctions() public {
        (bool ok,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", address(this), 1));
        assertFalse(ok);
        (ok,) = address(token).call(abi.encodeWithSignature("owner()"));
        assertFalse(ok);
        assertEq(token.totalSupply(), 1_000_000_000e18);
    }
}
