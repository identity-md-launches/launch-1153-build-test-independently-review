// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {FeeTreasury} from "../src/FeeTreasury.sol";
import {StakingVault} from "../src/StakingVault.sol";
import {Arena} from "../src/Arena.sol";

contract FeeTreasuryTest is Fixture {
    StakingVault vault;
    Arena arena;
    address executor = makeAddr("executor");
    address adapterAddr = makeAddr("adapter");

    function setUp() public {
        deployLaunch(true);
        seedLiquidity(10_000 ether, true);
        vm.deal(trader, 1_000 ether);
        vault = new StakingVault(owner, address(token));
        arena = new Arena(owner, address(token));
        vm.startPrank(owner);
        vault.setRewardFunder(address(treasury));
        treasury.setSinks(address(vault), address(arena), adapterAddr);
        treasury.setExecutor(executor);
        vm.stopPrank();
    }

    function earn(uint256 ethIn) internal {
        swap(trader, true, -int256(ethIn), ethIn);
    }

    function test_onlyHookCanFund_noOwnerAdvances() public {
        vm.deal(owner, 1 ether);
        vm.prank(owner);
        (bool ok,) = address(treasury).call{value: 1 ether}("");
        assertFalse(ok, "owner advances are refused");
        assertEq(treasury.totalIncome(), 0);
    }

    function test_allocationSplitAndReserveCap() public {
        earn(100 ether);
        uint256 income = treasury.totalIncome();
        assertGt(income, 0);
        treasury.allocate();
        uint256 toReserve = income / 10;
        assertEq(treasury.reserve(), toReserve, "reserve takes at most 10%");
        uint256 rest = income - toReserve;
        assertEq(treasury.imdBudget(), rest * 30 / 100);
        assertEq(treasury.prioBudget(), rest * 30 / 100);
        assertEq(treasury.ownerBudget(), rest - rest * 30 / 100 - rest * 30 / 100);
        assertEq(treasury.unallocated(), 0);
        assertEq(treasury.reserve() + treasury.imdBudget() + treasury.prioBudget() + treasury.ownerBudget(), income);
    }

    function test_reserveStopsAtTarget() public {
        vm.prank(owner);
        treasury.setReserveTarget(0.01 ether);
        earn(100 ether);
        treasury.allocate();
        assertEq(treasury.reserve(), 0.01 ether, "capped by the finite target");
        earn(100 ether);
        treasury.allocate();
        assertEq(treasury.reserve(), 0.01 ether, "no more once the target is reached");
        vm.prank(owner);
        vm.expectRevert(FeeTreasury.TooHigh.selector);
        treasury.setReserveTarget(3 ether);
    }

    function test_ownerAndReserveWithdrawalsAreCapped() public {
        earn(100 ether);
        treasury.allocate();
        uint256 ownerBudget = treasury.ownerBudget();
        address payable sink = payable(makeAddr("sink"));
        vm.prank(owner);
        vm.expectRevert(FeeTreasury.ExceedsBudget.selector);
        treasury.withdrawOwner(sink, ownerBudget + 1);
        vm.prank(owner);
        treasury.withdrawOwner(sink, ownerBudget);
        assertEq(sink.balance, ownerBudget);
        uint256 reserve = treasury.reserve();
        vm.prank(executor);
        treasury.withdrawReserve(sink, reserve);
        assertEq(sink.balance, ownerBudget + reserve);
        vm.prank(trader);
        vm.expectRevert(FeeTreasury.NotExecutor.selector);
        treasury.withdrawReserve(sink, 1);
    }

    function test_buyPrioSplitsBetweenStakingAndArena() public {
        earn(100 ether);
        treasury.allocate();
        uint256 budget = treasury.prioBudget();
        vm.prank(owner);
        treasury.setMaxSpendPerSwap(budget);
        vm.prank(executor);
        uint256 out = treasury.buyPrio(budget, 1);
        assertGt(out, 0);
        assertEq(treasury.prioBudget(), 0);
        assertEq(token.balanceOf(address(vault)), out / 2);
        assertEq(arena.unallocatedPrizePool(), out - out / 2);
        assertEq(vault.rewardsOwed(), out / 2);
        assertEq(token.balanceOf(address(treasury)), 0);
        // The 0.5% on the treasury's own buy flowed back as income.
        assertGt(treasury.unallocated(), 0);
    }

    function test_buyPrioGuards() public {
        earn(100 ether);
        treasury.allocate();
        uint256 budget = treasury.prioBudget();
        vm.prank(trader);
        vm.expectRevert(FeeTreasury.NotExecutor.selector);
        treasury.buyPrio(1, 0);
        vm.startPrank(executor);
        vm.expectRevert(FeeTreasury.ExceedsBudget.selector);
        treasury.buyPrio(budget + 1, 0);
        vm.expectRevert(FeeTreasury.ExceedsMaxSpend.selector);
        treasury.buyPrio(2 ether, 0);
        vm.expectRevert(FeeTreasury.Slippage.selector);
        treasury.buyPrio(0.1 ether, type(uint256).max);
        vm.stopPrank();
    }

    function test_imdPurchaseWaitsForConfiguration_prioIndependent() public {
        earn(100 ether);
        treasury.allocate();
        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(FeeTreasury.NotConfigured.selector, "imd pool"));
        treasury.buyImd(0.1 ether, 0);
        vm.prank(executor);
        treasury.buyPrio(0.1 ether, 1);
    }
}
