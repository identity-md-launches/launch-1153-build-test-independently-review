// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {FeeTreasury} from "../src/FeeTreasury.sol";
import {StakingVault} from "../src/StakingVault.sol";
import {Arena} from "../src/Arena.sol";

contract FeeTreasuryTest is Fixture {
    using StateLibrary for IPoolManager;

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
        // The pool opens at 1:1; a floor a little below spot is what the owner is told to keep.
        treasury.setPriceFloors(0.9 ether, 0.9 ether);
        vm.stopPrank();
    }

    function earn(uint256 ethIn) internal {
        swap(trader, true, -int256(ethIn), ethIn);
    }

    function tracked() internal view returns (uint256) {
        return treasury.unallocated() + treasury.reserve() + treasury.imdBudget() + treasury.prioBudget()
            + treasury.ownerBudget();
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
        earn(1_000 ether);
        treasury.allocate();
        uint256 budget = treasury.prioBudget();
        assertGt(budget, 1 ether);
        vm.prank(trader);
        vm.expectRevert(FeeTreasury.NotExecutor.selector);
        treasury.buyPrio(1, 0);
        vm.startPrank(executor);
        vm.expectRevert(FeeTreasury.ExceedsBudget.selector);
        treasury.buyPrio(budget + 1, 0);
        vm.expectRevert(FeeTreasury.ExceedsMaxSpend.selector);
        treasury.buyPrio(1 ether + 1, 0);
        vm.expectRevert(FeeTreasury.Slippage.selector);
        treasury.buyPrio(0.1 ether, type(uint256).max);
        vm.stopPrank();
        // Without a price floor nothing can be bought, whatever minOut the executor passes.
        vm.prank(owner);
        treasury.setPriceFloors(0, 0);
        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(FeeTreasury.NotConfigured.selector, "prio price floor"));
        treasury.buyPrio(0.1 ether, 0);
    }

    /// @dev Finding f247fcfa: the executor is bounded per rolling window, and a self-set price is refused.
    function test_rollingWindowAndPriceFloorBoundTheExecutor() public {
        earn(1_000 ether); // moves the price to about 0.83 PRIO per ETH
        treasury.allocate();
        vm.prank(owner);
        treasury.setPriceFloors(0.5 ether, 0.5 ether);
        vm.startPrank(executor);
        treasury.buyPrio(0.6 ether, 1);
        vm.expectRevert(FeeTreasury.ExceedsWindow.selector);
        treasury.buyPrio(0.5 ether, 1);
        treasury.buyPrio(0.4 ether, 1);
        assertEq(treasury.spentInWindow(), 1 ether);
        vm.expectRevert(FeeTreasury.ExceedsWindow.selector);
        treasury.buyPrio(1, 1);
        skip(1 days);
        treasury.buyPrio(0.1 ether, 1);
        vm.stopPrank();
        // The executor pumps the pool, then tries to buy at the manipulated price with minOut = 0.
        vm.deal(executor, 30_000 ether);
        swap(executor, true, -30_000 ether, 30_000 ether);
        vm.prank(executor);
        vm.expectRevert(FeeTreasury.Slippage.selector);
        treasury.buyPrio(0.1 ether, 0);
    }

    /// @dev Finding 11fcc3ca: a partial fill used to leave ETH on no budget line.
    function test_partialFillCreditsUnspentEthBackToTheBudget() public {
        earn(1_000 ether);
        treasury.allocate();
        uint256 budget = treasury.prioBudget();
        // Thin pool: replace the full-range liquidity with a small PRIO-only range just below the price, as a
        // token-only launch seed is, so a 1 ETH buy exhausts it.
        (, int24 tick,,) = IPoolManager(address(manager)).getSlot0(key.toId());
        int24 upper = (tick / TICK_SPACING) * TICK_SPACING - TICK_SPACING;
        vm.startPrank(factory);
        lpRouter.modifyLiquidity(
            key,
            ModifyLiquidityParams(
                TickMath.minUsableTick(TICK_SPACING), TickMath.maxUsableTick(TICK_SPACING), -int256(10_000 ether), 0
            ),
            ""
        );
        lpRouter.modifyLiquidity(key, ModifyLiquidityParams(upper - 600, upper, 2e18, 0), "");
        vm.stopPrank();
        assertEq(address(treasury).balance, tracked());
        vm.prank(owner);
        treasury.setPriceFloors(1, 1);
        vm.prank(executor);
        uint256 out = treasury.buyPrio(1 ether, 1);
        assertGt(out, 0);
        assertGt(treasury.prioBudget(), budget - 1 ether, "only the filled part left the budget");
        assertEq(address(treasury).balance, tracked(), "every wei is on exactly one budget line");
        assertLt(treasury.spentInWindow(), 1 ether, "the window counts what was spent");
    }

    function test_sinksAreSetOnceAndNonZero() public {
        FeeTreasury fresh = new FeeTreasury(IPoolManager(address(manager)), owner);
        vm.startPrank(owner);
        vm.expectRevert(FeeTreasury.ZeroAddress.selector);
        fresh.setSinks(address(0), address(arena), adapterAddr);
        fresh.setSinks(address(vault), address(arena), adapterAddr);
        vm.expectRevert(FeeTreasury.AlreadySet.selector);
        fresh.setSinks(address(vault), address(arena), adapterAddr);
        vm.stopPrank();
    }

    /// @dev Finding 99a932f9: changing the IMD token after the pool key was set must not swap a stale pair.
    function test_setImdUnsetsThePoolKey() public {
        vm.startPrank(owner);
        treasury.setImd(address(token));
        treasury.setImdPool(POOL_FEE, TICK_SPACING, address(hook));
        assertTrue(treasury.imdPoolSet());
        treasury.setImd(makeAddr("otherImd"));
        assertFalse(treasury.imdPoolSet());
        vm.stopPrank();
        earn(100 ether);
        treasury.allocate();
        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(FeeTreasury.NotConfigured.selector, "imd pool"));
        treasury.buyImd(0.1 ether, 0);
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
