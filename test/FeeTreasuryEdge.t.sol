// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {FeeTreasury} from "../src/FeeTreasury.sol";
import {StakingVault} from "../src/StakingVault.sol";
import {Arena} from "../src/Arena.sol";
import {PrismRiotToken} from "../src/PrismRiotToken.sol";
import {TwoStepOwned} from "../src/TwoStepOwned.sol";

contract RejectsEth {
    receive() external payable {
        revert("no");
    }
}

/// @dev Treasury failure paths: zero allocation, a reserve above a lowered target, a recipient that rejects
/// ETH, purchases without the funder role, the IMD venue flow on a second pool, slippage, caller guards,
/// ownership, and the configuration order.
/// forge-config: default.fuzz.runs = 512
contract FeeTreasuryEdgeTest is Fixture {
    StakingVault vault;
    Arena arena;
    PrismRiotToken imd;
    address executor = makeAddr("executor");
    address adapterAddr = makeAddr("adapter");

    receive() external payable {}

    function setUp() public {
        deployLaunch(true);
        seedLiquidity(10_000 ether, true);
        vm.deal(trader, 10_000 ether);
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

    function bucketsEqualBalance() internal view {
        assertEq(
            address(treasury).balance,
            treasury.unallocated() + treasury.reserve() + treasury.imdBudget() + treasury.prioBudget()
                + treasury.ownerBudget()
        );
    }

    // ------------------------------------------------------------------ allocation

    function test_allocateWithNothingIsANoOp() public {
        treasury.allocate();
        assertEq(treasury.reserve(), 0);
        assertEq(treasury.ownerBudget(), 0);
        bucketsEqualBalance();
    }

    function test_allocateIsIdempotentUntilNewIncome() public {
        earn(10 ether);
        treasury.allocate();
        uint256 r = treasury.reserve();
        uint256 o = treasury.ownerBudget();
        treasury.allocate();
        assertEq(treasury.reserve(), r);
        assertEq(treasury.ownerBudget(), o);
        bucketsEqualBalance();
    }

    /// @dev Lowering the target below the reserve stops replenishment; nothing is clawed back.
    function test_reserveAboveLoweredTargetGetsNothingMore() public {
        earn(100 ether);
        treasury.allocate();
        uint256 reserve = treasury.reserve();
        assertGt(reserve, 0.01 ether);
        vm.prank(owner);
        treasury.setReserveTarget(0.01 ether);
        earn(100 ether);
        uint256 income = treasury.unallocated();
        treasury.allocate();
        assertEq(treasury.reserve(), reserve, "no more to the reserve");
        assertEq(
            treasury.imdBudget() + treasury.prioBudget() + treasury.ownerBudget(),
            address(treasury).balance - reserve,
            "the whole new allocation went to the three budgets"
        );
        income;
        bucketsEqualBalance();
    }

    /// @dev For any income and target, the reserve never takes more than 10% of an allocation and never
    /// passes the target, and the remainder splits exactly 30/30/40 with nothing lost.
    function testFuzz_allocationArithmetic(uint96 ethIn, uint256 target) public {
        uint256 amountIn = bound(ethIn, 1e9, 500 ether);
        target = bound(target, 0, 2 ether);
        vm.prank(owner);
        treasury.setReserveTarget(target);
        earn(amountIn);
        uint256 income = treasury.unallocated();
        treasury.allocate();
        uint256 toReserve = treasury.reserve();
        assertLe(toReserve, income / 10);
        assertLe(toReserve, target);
        uint256 rest = income - toReserve;
        assertEq(treasury.imdBudget(), rest * 3 / 10);
        assertEq(treasury.prioBudget(), rest * 3 / 10);
        assertEq(treasury.ownerBudget(), rest - rest * 3 / 10 - rest * 3 / 10);
        assertGe(treasury.ownerBudget() * 10, rest * 4 - 20, "owner share is 40% up to rounding");
        bucketsEqualBalance();
    }

    // ------------------------------------------------------------------ withdrawals

    function test_withdrawToRejectingRecipientRevertsAndKeepsBudget() public {
        earn(10 ether);
        treasury.allocate();
        uint256 budget = treasury.ownerBudget();
        address payable bad = payable(address(new RejectsEth()));
        vm.prank(owner);
        vm.expectRevert(FeeTreasury.TransferFailed.selector);
        treasury.withdrawOwner(bad, budget);
        assertEq(treasury.ownerBudget(), budget);
        vm.prank(executor);
        vm.expectRevert(FeeTreasury.TransferFailed.selector);
        treasury.withdrawReserve(bad, 1);
        bucketsEqualBalance();
    }

    function test_executorCannotTakeOwnerBudget_ownerCannotExceedReserve() public {
        earn(10 ether);
        treasury.allocate();
        address payable sink = payable(makeAddr("sink"));
        vm.prank(executor);
        vm.expectRevert();
        treasury.withdrawOwner(sink, 1);
        uint256 reserve = treasury.reserve();
        vm.prank(owner);
        vm.expectRevert(FeeTreasury.ExceedsBudget.selector);
        treasury.withdrawReserve(sink, reserve + 1);
        vm.prank(owner);
        treasury.withdrawReserve(sink, reserve);
        assertEq(treasury.reserve(), 0);
        bucketsEqualBalance();
    }

    function test_withdrawZeroIsHarmless() public {
        address payable sink = payable(makeAddr("sink"));
        vm.prank(owner);
        treasury.withdrawOwner(sink, 0);
        vm.prank(executor);
        treasury.withdrawReserve(sink, 0);
        assertEq(sink.balance, 0);
    }

    // ------------------------------------------------------------------ purchases

    function test_buyPrioFailsWithoutFunderRoleAndRollsBack() public {
        earn(100 ether);
        treasury.allocate();
        vm.prank(owner);
        vault.setRewardFunder(address(0));
        uint256 budget = treasury.prioBudget();
        vm.prank(executor);
        vm.expectRevert(StakingVault.NotFunder.selector);
        treasury.buyPrio(0.05 ether, 1);
        assertEq(treasury.prioBudget(), budget, "a failed buy spends nothing");
        bucketsEqualBalance();
    }

    function test_buyPrioRefusesZeroAndUnsetSinks() public {
        earn(100 ether);
        treasury.allocate();
        vm.prank(executor);
        vm.expectRevert(FeeTreasury.ExceedsBudget.selector);
        treasury.buyPrio(0, 0);
        vm.prank(owner);
        treasury.setSinks(address(0), address(arena), adapterAddr);
        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(FeeTreasury.NotConfigured.selector, "sinks"));
        treasury.buyPrio(0.1 ether, 0);
    }

    function test_buyPrioOnUnboundTreasuryRefused() public {
        FeeTreasury fresh = new FeeTreasury(manager, owner);
        vm.prank(owner);
        fresh.setExecutor(executor);
        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(FeeTreasury.NotConfigured.selector, "prio"));
        fresh.buyPrio(1, 0);
    }

    /// @dev Repeated purchases drain the PRIO budget to zero but never past it; ETH buckets stay exact.
    function testFuzz_repeatedBuysNeverOverspend(uint8 n) public {
        n = uint8(bound(n, 1, 8));
        earn(200 ether);
        treasury.allocate();
        uint256 budget = treasury.prioBudget();
        uint256 spent;
        for (uint256 i; i < n; i++) {
            uint256 left = treasury.prioBudget();
            if (left == 0) break;
            uint256 amount = left / 2 + 1 > treasury.maxSpendPerSwap() ? treasury.maxSpendPerSwap() : left / 2 + 1;
            if (amount > left) amount = left;
            vm.prank(executor);
            treasury.buyPrio(amount, 1);
            spent += amount;
            bucketsEqualBalance();
        }
        assertEq(treasury.prioBudget() + spent, budget);
        assertEq(token.balanceOf(address(treasury)), 0);
    }

    // ------------------------------------------------------------------ IMD venue

    function setUpImdPool() internal returns (PoolKey memory imdKey) {
        imd = new PrismRiotToken();
        imdKey = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(address(imd)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
        manager.initialize(imdKey, SQRT_PRICE_1_1);
        imd.approve(address(lpRouter), type(uint256).max);
        vm.deal(address(this), 1_000 ether);
        lpRouter.modifyLiquidity{value: 200 ether}(
            imdKey,
            ModifyLiquidityParams(TickMath.minUsableTick(60), TickMath.maxUsableTick(60), 100 ether, bytes32(0)),
            ""
        );
    }

    function test_setImdPoolRequiresImdFirst_thenBuyImdDeliversToAdapter() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FeeTreasury.NotConfigured.selector, "imd"));
        treasury.setImdPool(3000, 60, address(0));
        PoolKey memory imdKey = setUpImdPool();
        vm.startPrank(owner);
        treasury.setImd(address(imd));
        treasury.setImdPool(3000, 60, address(0));
        vm.stopPrank();
        assertTrue(treasury.imdPoolSet());
        assertEq(Currency.unwrap(treasury.imdPoolKey().currency1), address(imd));
        imdKey;

        earn(100 ether);
        treasury.allocate();
        uint256 budget = treasury.imdBudget();
        vm.prank(executor);
        vm.expectRevert(FeeTreasury.Slippage.selector);
        treasury.buyImd(0.1 ether, type(uint256).max);
        vm.prank(executor);
        uint256 out = treasury.buyImd(0.1 ether, 1);
        assertGt(out, 0);
        assertEq(imd.balanceOf(adapterAddr), out, "IMD lands in the oracle adapter");
        assertEq(treasury.imdBudget(), budget - 0.1 ether);
        assertEq(imd.balanceOf(address(treasury)), 0);
        bucketsEqualBalance();
        // Guards.
        vm.prank(trader);
        vm.expectRevert(FeeTreasury.NotExecutor.selector);
        treasury.buyImd(0.1 ether, 0);
        vm.prank(executor);
        vm.expectRevert(FeeTreasury.ExceedsMaxSpend.selector);
        treasury.buyImd(1 ether + 1, 0);
        uint256 imdBudget = treasury.imdBudget();
        vm.prank(executor);
        vm.expectRevert(FeeTreasury.ExceedsBudget.selector);
        treasury.buyImd(imdBudget + 1, 0);
        vm.prank(owner);
        treasury.setSinks(address(vault), address(arena), address(0));
        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(FeeTreasury.NotConfigured.selector, "oracle adapter"));
        treasury.buyImd(0.1 ether, 0);
    }

    // ------------------------------------------------------------------ guards and ownership

    function test_unlockCallbackOnlyFromManager() public {
        vm.expectRevert(FeeTreasury.NotPoolManager.selector);
        treasury.unlockCallback(abi.encode(key, uint256(1)));
    }

    function test_configurationIsOwnerOnlyAndOneShotWhereStated() public {
        vm.startPrank(trader);
        vm.expectRevert();
        treasury.bindHook(trader);
        vm.expectRevert();
        treasury.setPrio(trader);
        vm.expectRevert();
        treasury.setImd(trader);
        vm.expectRevert();
        treasury.setSinks(trader, trader, trader);
        vm.expectRevert();
        treasury.setExecutor(trader);
        vm.expectRevert();
        treasury.setReserveTarget(1);
        vm.expectRevert();
        treasury.setMaxSpendPerSwap(1);
        vm.stopPrank();
        vm.startPrank(owner);
        vm.expectRevert(FeeTreasury.HookAlreadyBound.selector);
        treasury.bindHook(trader);
        vm.expectRevert(FeeTreasury.AlreadySet.selector);
        treasury.setPrio(trader);
        vm.expectRevert(FeeTreasury.ZeroAddress.selector);
        treasury.setImd(address(0));
        vm.stopPrank();
        FeeTreasury fresh = new FeeTreasury(manager, owner);
        vm.startPrank(owner);
        vm.expectRevert(FeeTreasury.ZeroAddress.selector);
        fresh.bindHook(address(0));
        vm.expectRevert(FeeTreasury.ZeroAddress.selector);
        fresh.setPrio(address(0));
        vm.stopPrank();
    }

    function test_strangerEthRefusedEvenAfterBinding() public {
        vm.deal(trader, 1 ether);
        vm.prank(trader);
        (bool ok,) = address(treasury).call{value: 1}("");
        assertFalse(ok);
        vm.prank(trader);
        (ok,) = address(treasury).call{value: 1}(hex"12345678");
        assertFalse(ok, "no fallback accepts ETH either");
        assertEq(address(treasury).balance, 0);
    }

    function test_ownershipTwoStepNoRenounce() public {
        vm.prank(owner);
        vm.expectRevert(TwoStepOwned.RenunciationDisabled.selector);
        treasury.renounceOwnership();
        vm.prank(owner);
        treasury.transferOwnership(trader);
        assertEq(treasury.owner(), owner);
        vm.prank(trader);
        treasury.acceptOwnership();
        assertEq(treasury.owner(), trader);
        vm.prank(owner);
        vm.expectRevert();
        treasury.setExecutor(owner);
    }
}
