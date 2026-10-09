// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {DeployScript} from "../script/Deploy.s.sol";

contract DeployTest is Test {
    function test_deployAllPlacesHookOnFlaggedAddress() public {
        PoolManager manager = new PoolManager(address(this));
        DeployScript s = new DeployScript();
        DeployScript.Deployed memory d = s.deployAll(
            DeployScript.Config(
                IPoolManager(address(manager)), makeAddr("factory"), makeAddr("owner"), makeAddr("signer")
            )
        );
        assertEq(uint160(address(d.hook)) & 0x3FFF, s.HOOK_FLAGS());
        assertEq(d.hook.owner(), makeAddr("owner"));
        assertEq(d.token.balanceOf(address(s)), 1_000_000_000 ether);
        assertEq(address(d.vault.prio()), address(d.token));
    }
}
