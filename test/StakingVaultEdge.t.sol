// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PrismRiotToken} from "../src/PrismRiotToken.sol";
import {StakingVault} from "../src/StakingVault.sol";
import {TwoStepOwned} from "../src/TwoStepOwned.sol";

/// @dev Failure paths and properties of the vault: zero amounts, over-withdrawal, strangers funding,
/// principal exactness under an active stream, pro-rata by stake and time, and claims bounded by funding.
/// forge-config: default.fuzz.runs = 512
contract StakingVaultEdgeTest is Test {
    PrismRiotToken token;
    StakingVault vault;
    address owner = makeAddr("owner");
    address funder = makeAddr("funder");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.warp(1_800_000_000);
        token = new PrismRiotToken();
        vault = new StakingVault(owner, address(token));
        vm.prank(owner);
        vault.setRewardFunder(funder);
        token.transfer(alice, 1_000_000 ether);
        token.transfer(bob, 1_000_000 ether);
        token.transfer(funder, 1_000_000 ether);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
        vm.prank(funder);
        token.approve(address(vault), type(uint256).max);
    }

    // ------------------------------------------------------------------ refusals

    function test_zeroAmountsRefused() public {
        vm.startPrank(alice);
        vm.expectRevert(StakingVault.ZeroAmount.selector);
        vault.stake(0);
        vm.expectRevert(StakingVault.ZeroAmount.selector);
        vault.withdraw(0);
        vm.stopPrank();
        vm.prank(funder);
        vm.expectRevert(StakingVault.ZeroAmount.selector);
        vault.notifyReward(0);
    }

    function test_withdrawMoreThanStakedRefused_evenWithOthersPrincipalPresent() public {
        vm.prank(bob);
        vault.stake(1_000 ether);
        vm.prank(alice);
        vault.stake(10 ether);
        vm.prank(alice);
        vm.expectRevert(StakingVault.InsufficientStake.selector);
        vault.withdraw(10 ether + 1);
        vm.prank(alice);
        vault.withdraw(10 ether);
        assertEq(vault.staked(bob), 1_000 ether);
        assertEq(token.balanceOf(address(vault)), 1_000 ether);
    }

    function test_strangerCannotFund_andFundingPullsFromFunderOnly() public {
        vm.prank(alice);
        vault.stake(100 ether);
        vm.prank(bob);
        vm.expectRevert(StakingVault.NotFunder.selector);
        vault.notifyReward(1 ether);
        // The funder's notification pulls from the funder: no principal is ever used for rewards.
        vm.prank(funder);
        vault.notifyReward(1 ether);
        assertEq(token.balanceOf(address(vault)), 101 ether);
        assertEq(vault.rewardReserve(), 1 ether);
        assertEq(vault.totalStaked(), 100 ether);
        // The owner may fund too, from its own balance.
        token.transfer(owner, 5 ether);
        vm.startPrank(owner);
        token.approve(address(vault), 5 ether);
        vault.notifyReward(5 ether);
        vm.stopPrank();
        assertEq(vault.rewardReserve(), 6 ether);
    }

    function test_funderWithoutBalanceCannotFund() public {
        address broke = makeAddr("broke");
        vm.prank(owner);
        vault.setRewardFunder(broke);
        vm.startPrank(broke);
        token.approve(address(vault), 1 ether);
        vm.expectRevert();
        vault.notifyReward(1 ether);
        vm.stopPrank();
        assertEq(vault.rewardsOwed(), 0);
        assertEq(vault.periodFinish(), 0);
    }

    function test_claimWithNothingEarnedIsANoOp() public {
        vm.prank(alice);
        vault.claim();
        assertEq(token.balanceOf(alice), 1_000_000 ether);
        vm.prank(alice);
        vault.stake(1 ether);
        skip(10 days);
        vm.prank(alice);
        vault.claim();
        assertEq(token.balanceOf(alice), 1_000_000 ether - 1 ether, "no funding, no reward");
    }

    function test_ownershipAndConfigurationGuards() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setRewardFunder(alice);
        vm.prank(alice);
        vm.expectRevert();
        vault.setRewardsDuration(7 days);
        vm.startPrank(owner);
        vm.expectRevert(StakingVault.BadDuration.selector);
        vault.setRewardsDuration(366 days);
        vm.expectRevert(StakingVault.BadDuration.selector);
        vault.setRewardsDuration(1 days - 1);
        vault.setRewardsDuration(365 days);
        vault.setRewardsDuration(1 days);
        vm.expectRevert(TwoStepOwned.RenunciationDisabled.selector);
        vault.renounceOwnership();
        vault.transferOwnership(bob);
        vm.stopPrank();
        assertEq(vault.owner(), owner);
        vm.prank(bob);
        vault.acceptOwnership();
        assertEq(vault.owner(), bob);
    }

    function test_constructorRefusesZeroToken() public {
        vm.expectRevert(StakingVault.ZeroAddress.selector);
        new StakingVault(owner, address(0));
    }

    // ------------------------------------------------------------------ principal isolation

    /// @dev Whatever the stream does, withdraw returns exactly what was staked, and the rewards owed never
    /// touch the principal held for others.
    function testFuzz_principalIsExactUnderAnActiveStream(uint96 a, uint96 b, uint96 reward, uint32 dt) public {
        uint256 stakeA = bound(a, 1, 1_000_000 ether);
        uint256 stakeB = bound(b, 1, 1_000_000 ether);
        uint256 funded = bound(reward, 1, 1_000_000 ether);
        uint256 elapsed = bound(dt, 0, 60 days);
        vm.prank(alice);
        vault.stake(stakeA);
        vm.prank(bob);
        vault.stake(stakeB);
        vm.prank(funder);
        vault.notifyReward(funded);
        skip(elapsed);
        vm.prank(alice);
        vault.withdraw(stakeA);
        assertEq(token.balanceOf(alice), 1_000_000 ether, "principal back exactly, rewards untouched");
        assertEq(vault.staked(alice), 0);
        assertEq(vault.totalStaked(), stakeB);
        uint256 earnedA = vault.earned(alice);
        vm.prank(alice);
        vault.claim();
        assertEq(token.balanceOf(alice), 1_000_000 ether + earnedA);
        assertGe(token.balanceOf(address(vault)), vault.totalStaked() + vault.rewardsOwed());
        assertGe(token.balanceOf(address(vault)), stakeB, "bob's principal is always there");
    }

    /// @dev Rewards are pro rata by stake: two stakers over the same window earn in the ratio of stakes,
    /// and together never more than what was funded.
    function testFuzz_proRataByStake(uint96 a, uint96 b, uint96 reward) public {
        uint256 stakeA = bound(a, 1 ether, 1_000_000 ether);
        uint256 stakeB = bound(b, 1 ether, 1_000_000 ether);
        uint256 funded = bound(reward, 1 ether, 1_000_000 ether);
        vm.prank(alice);
        vault.stake(stakeA);
        vm.prank(bob);
        vault.stake(stakeB);
        vm.prank(funder);
        vault.notifyReward(funded);
        skip(30 days);
        uint256 ea = vault.earned(alice);
        uint256 eb = vault.earned(bob);
        assertLe(ea + eb, funded, "never more than funded");
        assertGe(ea + eb, funded - funded / 1e9 - 2, "and all of it, up to rounding dust");
        // ea / eb == stakeA / stakeB up to rounding.
        assertApproxEqRel(ea * stakeB, eb * stakeA, 1e12);
        vm.prank(alice);
        vault.claim();
        vm.prank(bob);
        vault.claim();
        assertEq(token.balanceOf(alice), 1_000_000 ether - stakeA + ea);
        assertEq(token.balanceOf(bob), 1_000_000 ether - stakeB + eb);
        assertGe(token.balanceOf(address(vault)), vault.totalStaked() + vault.rewardsOwed());
    }

    /// @dev Rewards are pro rata by time: a staker present for half the stream earns half of a full-time
    /// staker of equal size.
    function test_proRataByTime() public {
        vm.prank(alice);
        vault.stake(100 ether);
        vm.prank(funder);
        vault.notifyReward(3_000 ether);
        skip(15 days);
        vm.prank(bob);
        vault.stake(100 ether);
        skip(15 days);
        // alice: 15 days alone (1500) + 15 days half (750) = 2250; bob: 750.
        assertApproxEqAbs(vault.earned(alice), 2_250 ether, 1e9);
        assertApproxEqAbs(vault.earned(bob), 750 ether, 1e9);
        skip(365 days);
        assertApproxEqAbs(vault.earned(alice), 2_250 ether, 1e9, "accrual stopped at periodFinish");
        assertApproxEqAbs(vault.earned(bob), 750 ether, 1e9);
    }

    /// @dev Accrual stops when the stream ends and only resumes with a new funding.
    function test_noAccrualBetweenStreams() public {
        vm.prank(alice);
        vault.stake(100 ether);
        vm.prank(funder);
        vault.notifyReward(300 ether);
        skip(30 days);
        uint256 atEnd = vault.earned(alice);
        skip(100 days);
        assertEq(vault.earned(alice), atEnd, "nothing accrues without funding");
        vm.prank(funder);
        vault.notifyReward(300 ether);
        skip(1 days);
        assertGt(vault.earned(alice), atEnd);
    }

    /// @dev Total claims over a stream never exceed the amount funded, with any number of actions.
    function testFuzz_claimsNeverExceedFunding(uint96 reward, uint8 steps) public {
        uint256 funded = bound(reward, 1, 100_000 ether);
        steps = uint8(bound(steps, 1, 20));
        vm.prank(alice);
        vault.stake(7 ether);
        vm.prank(bob);
        vault.stake(3 ether);
        vm.prank(funder);
        vault.notifyReward(funded);
        uint256 claimed;
        for (uint256 i; i < steps; i++) {
            skip(2 days);
            uint256 before = token.balanceOf(alice) + token.balanceOf(bob);
            vm.prank(alice);
            vault.claim();
            vm.prank(bob);
            vault.claim();
            claimed += token.balanceOf(alice) + token.balanceOf(bob) - before;
        }
        assertLe(claimed, funded);
        assertEq(vault.rewardsOwed(), funded - claimed);
        assertGe(token.balanceOf(address(vault)), vault.totalStaked() + vault.rewardsOwed());
    }

    function test_exitReturnsPrincipalAndRewards() public {
        vm.prank(alice);
        vault.stake(100 ether);
        vm.prank(funder);
        vault.notifyReward(300 ether);
        skip(30 days);
        vm.prank(alice);
        vault.exit();
        assertApproxEqAbs(token.balanceOf(alice), 1_000_000 ether + 300 ether, 1e9);
        assertEq(vault.staked(alice), 0);
    }
}
