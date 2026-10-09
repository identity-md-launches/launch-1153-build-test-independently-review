// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PrismRiotToken} from "../src/PrismRiotToken.sol";
import {StakingVault} from "../src/StakingVault.sol";

contract StakingVaultTest is Test {
    PrismRiotToken token;
    StakingVault vault;
    address owner = makeAddr("owner");
    address funder = makeAddr("funder");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        token = new PrismRiotToken();
        vault = new StakingVault(owner, address(token));
        vm.prank(owner);
        vault.setRewardFunder(funder);
        token.transfer(alice, 1_000 ether);
        token.transfer(bob, 1_000 ether);
        token.transfer(funder, 10_000 ether);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
        vm.prank(funder);
        token.approve(address(vault), type(uint256).max);
    }

    function test_stakeWithdrawKeepsPrincipalExact() public {
        vm.prank(alice);
        vault.stake(100 ether);
        assertEq(vault.staked(alice), 100 ether);
        assertEq(vault.totalStaked(), 100 ether);
        vm.prank(alice);
        vault.withdraw(100 ether);
        assertEq(token.balanceOf(alice), 1_000 ether);
        vm.prank(alice);
        vm.expectRevert(StakingVault.InsufficientStake.selector);
        vault.withdraw(1);
    }

    function test_noRewardsWithoutFunding() public {
        vm.prank(alice);
        vault.stake(100 ether);
        skip(30 days);
        assertEq(vault.earned(alice), 0);
        vm.prank(alice);
        vault.claim();
        assertEq(token.balanceOf(alice), 900 ether);
    }

    function test_rewardsProRataByStakeAndTime_andStopAtPeriodEnd() public {
        vm.prank(alice);
        vault.stake(100 ether);
        vm.prank(bob);
        vault.stake(300 ether);
        vm.prank(funder);
        vault.notifyReward(3_000 ether);
        skip(15 days);
        assertApproxEqAbs(vault.earned(alice), 375 ether, 1e9);
        assertApproxEqAbs(vault.earned(bob), 1_125 ether, 1e9);
        skip(30 days); // past the end: accrual stopped at 30 days
        assertApproxEqAbs(vault.earned(alice), 750 ether, 1e9);
        assertApproxEqAbs(vault.earned(bob), 2_250 ether, 1e9);
        vm.prank(alice);
        vault.exit();
        assertApproxEqAbs(token.balanceOf(alice), 1_750 ether, 1e9);
        assertEq(vault.staked(alice), 0);
        // Principal of bob is intact and never used for rewards.
        assertGe(token.balanceOf(address(vault)), vault.totalStaked() + vault.rewardsOwed());
    }

    function test_onlyFunderOrOwnerNotifies() public {
        vm.prank(alice);
        vm.expectRevert(StakingVault.NotFunder.selector);
        vault.notifyReward(1 ether);
    }

    function test_durationBounds() public {
        vm.startPrank(owner);
        vm.expectRevert(StakingVault.BadDuration.selector);
        vault.setRewardsDuration(1 hours);
        vault.setRewardsDuration(7 days);
        vm.stopPrank();
        assertEq(vault.rewardsDuration(), 7 days);
    }

    /// @dev Finding caf40ce6: a stream notified before anyone staked used to pay half of itself to nobody.
    function test_streamPausesWhileNothingIsStaked_nothingStranded() public {
        vm.prank(funder);
        vault.notifyReward(3_000 ether);
        uint256 finish = vault.periodFinish();
        skip(15 days);
        assertEq(vault.earned(alice), 0);
        vm.prank(alice);
        vault.stake(100 ether);
        assertEq(vault.periodFinish(), finish + 15 days, "idle time extends the schedule");
        skip(30 days);
        vm.prank(alice);
        vault.exit();
        assertApproxEqAbs(token.balanceOf(alice), 4_000 ether, 1e9, "the whole stream reached the staker");
        assertLe(token.balanceOf(address(vault)), 1e9, "nothing stranded beyond rounding dust");
        assertLe(vault.rewardsOwed(), 1e9);
    }

    function test_streamPausesAgainWhenEveryoneLeaves() public {
        vm.prank(alice);
        vault.stake(100 ether);
        vm.prank(funder);
        vault.notifyReward(3_000 ether);
        skip(10 days);
        vm.prank(alice);
        vault.exit(); // 1000 claimed, totalStaked back to 0
        assertApproxEqAbs(token.balanceOf(alice), 2_000 ether, 1e9);
        skip(100 days); // idle: nothing streams
        vm.prank(bob);
        vault.stake(300 ether);
        skip(20 days); // the remaining 20 days of schedule
        assertApproxEqAbs(vault.earned(bob), 2_000 ether, 1e9, "the paused remainder is paid in full");
        vm.prank(bob);
        vault.claim();
        assertLe(vault.rewardsOwed(), 1e9);
        assertGe(token.balanceOf(address(vault)), vault.totalStaked() + vault.rewardsOwed());
    }

    function test_notifyWhileIdleKeepsRemainderAndRestartsSchedule() public {
        vm.prank(funder);
        vault.notifyReward(300 ether);
        skip(10 days); // idle
        vm.prank(funder);
        vault.notifyReward(100 ether);
        assertApproxEqAbs(vault.rewardsOwed(), 400 ether, 1e9, "nothing of the first stream was lost");
        assertEq(vault.periodFinish(), block.timestamp + 30 days);
        vm.prank(alice);
        vault.stake(1 ether);
        skip(30 days);
        assertApproxEqAbs(vault.earned(alice), 400 ether, 1e9);
    }

    function test_leftoverRollsIntoNextStream() public {
        vm.prank(alice);
        vault.stake(100 ether);
        vm.prank(funder);
        vault.notifyReward(300 ether);
        skip(10 days);
        vm.prank(funder);
        vault.notifyReward(100 ether);
        assertApproxEqAbs(vault.rewardsOwed(), 400 ether, 1e9);
        skip(30 days);
        assertApproxEqAbs(vault.earned(alice), 400 ether, 1e9);
        assertGe(token.balanceOf(address(vault)), vault.totalStaked() + vault.rewardsOwed());
    }
}
