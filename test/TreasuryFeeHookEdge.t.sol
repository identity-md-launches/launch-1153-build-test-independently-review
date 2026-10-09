// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {TreasuryFeeHook} from "../src/TreasuryFeeHook.sol";
import {TwoStepOwned} from "../src/TwoStepOwned.sol";

/// @dev Adversarial edges of the hook: dust, price limits, a treasury that cannot take ETH, a manager that
/// cannot cover a claim, a second (hookless) ETH/PRIO pool, and the absence of any fee setter.
/// forge-config: default.fuzz.runs = 512
contract TreasuryFeeHookEdgeTest is Fixture {
    using StateLibrary for IPoolManager;

    function setUp() public {
        deployLaunch(true);
        seedLiquidity(10_000 ether, true);
        vm.deal(trader, 10_000 ether);
        vm.prank(factory);
        token.transfer(trader, 10_000_000 ether);
    }

    function swapLimited(bool zeroForOne, int256 amountSpecified, uint160 limit, uint256 value)
        internal
        returns (BalanceDelta d)
    {
        vm.startPrank(trader);
        token.approve(address(swapRouter), type(uint256).max);
        d = swapRouter.swap{value: value}(
            key,
            SwapParams({zeroForOne: zeroForOne, amountSpecified: amountSpecified, sqrtPriceLimitX96: limit}),
            PoolSwapTest.TestSettings(false, false),
            ""
        );
        vm.stopPrank();
    }

    function currentPrice() internal view returns (uint160 p) {
        (p,,,) = IPoolManager(address(manager)).getSlot0(key.toId());
    }

    // ------------------------------------------------------------------ dust

    /// @dev One wei in: the whole wei is the (rounded-up) fee, the pool swaps nothing, nothing reverts.
    function test_oneWeiBuyIsAllFeeAndDoesNotRevert() public {
        uint256 prioBefore = token.balanceOf(trader);
        uint256 ethBefore = trader.balance;
        swap(trader, true, -1, 1);
        assertEq(ethBefore - trader.balance, 1);
        assertEq(token.balanceOf(trader), prioBefore, "no PRIO for a 1 wei input");
        assertEq(treasury.totalIncome(), 1);
        assertEq(hook.totalFeeCharged(), 1);
    }

    /// @dev Up to 200 wei the fee is exactly one wei; the swapper still gets the rest swapped.
    function testFuzz_dustBuysChargeOneWei(uint256 grossIn) public {
        grossIn = bound(grossIn, 2, 200);
        uint256 prioBefore = token.balanceOf(trader);
        swap(trader, true, -int256(grossIn), grossIn);
        assertEq(treasury.totalIncome(), 1, "ceil(0.5%) of up to 199 wei is one wei");
        assertGe(token.balanceOf(trader), prioBefore, "the pool leg is grossIn - 1 and never negative");
    }

    /// @dev Tiny exact outputs in both directions: a one-wei ETH leg still pays a one-wei fee.
    function test_tinyExactOutputsBothDirections() public {
        uint256 ethBefore = trader.balance;
        swap(trader, false, int256(1), 0); // sell PRIO for exactly 1 wei of ETH
        assertEq(trader.balance - ethBefore, 1, "exactly the wei asked for");
        assertEq(treasury.totalIncome(), 1, "fee = ceil(1 * 50 / 9950) = 1 wei, taken from the pool leg");

        uint256 incomeBefore = treasury.totalIncome();
        uint256 prioBefore = token.balanceOf(trader);
        swap(trader, true, int256(1), 1 ether); // buy exactly 1 wei of PRIO
        assertEq(token.balanceOf(trader) - prioBefore, 1);
        assertGe(treasury.totalIncome() - incomeBefore, 1, "a non-zero ETH leg always pays at least one wei");
    }

    /// @dev No shape reverts anywhere between one wei and a large trade, with a full-range limit.
    function testFuzz_everyShapeSucceedsAcrossMagnitudes(uint256 raw, uint8 shape) public {
        shape = uint8(bound(shape, 0, 3));
        uint256 amount = bound(raw, 1, 100 ether);
        bool zeroForOne = shape < 2;
        bool exactIn = shape % 2 == 0;
        int256 spec = exactIn ? -int256(amount) : int256(amount);
        uint256 before = hook.totalFeeCharged();
        uint256 ethBefore = trader.balance;
        swap(trader, zeroForOne, spec, zeroForOne ? 1_000 ether : 0);
        uint256 charged = hook.totalFeeCharged() - before;
        uint256 ethMoved = zeroForOne ? ethBefore - trader.balance : trader.balance - ethBefore;
        if (ethMoved + charged > 0) {
            assertGt(charged, 0, "every swap that moves ETH pays the fee");
        } else {
            // A one-wei PRIO sale buys no ETH at all: nothing to charge on, and nothing reverted.
            assertEq(charged, 0);
        }
    }

    // ------------------------------------------------------------------ the fee tracks the executed leg

    /// @dev With the full-range price limit the four shapes each pay exactly 0.5% (rounded up) of the ETH
    /// the pool exchanged, measured from the swapper's own balance change rather than the hook's quote.
    function testFuzz_feeIsHalfPercentOfExecutedLeg(uint96 raw, uint8 shape) public {
        shape = uint8(bound(shape, 0, 3));
        uint256 amount = bound(raw, 1e6, 50 ether);
        bool zeroForOne = shape < 2;
        bool exactIn = shape % 2 == 0;
        int256 spec = exactIn ? -int256(amount) : int256(amount);
        uint256 ethBefore = trader.balance;
        swap(trader, zeroForOne, spec, zeroForOne ? 1_000 ether : 0);
        uint256 fee = treasury.totalIncome();
        uint256 leg = zeroForOne ? (ethBefore - trader.balance) - fee : (trader.balance - ethBefore) + fee;
        if (exactIn == zeroForOne) {
            // ETH-specified shapes solve fee = ceil(0.5% of (gross - fee)): the smallest self-consistent fee,
            // which is ceil(0.5% of the leg) or one wei above it.
            assertGe(fee, hook.feeOnLeg(leg), "never below 0.5% of the executed leg");
            assertLe(fee, hook.feeOnLeg(leg) + 1, "never more than one wei above it");
        } else {
            assertEq(fee, hook.feeOnLeg(leg), "fee is ceil(0.5% of the ETH the pool exchanged)");
        }
        // Never more than two wei above the exact fraction.
        assertLe(fee * 10_000, leg * 50 + 20_000);
    }

    /// @dev The two shapes charged in afterSwap read the pool's actual delta, so a price limit that cuts the
    /// fill short cuts the fee with it. (The two beforeSwap shapes do not: see .imd-findings.json.)
    function test_partialFill_afterSwapShapesChargeOnExecutedLegOnly() public {
        // Buy exact output, limit just below the price: the pool fills a fraction of the 100 PRIO asked.
        uint160 price = currentPrice();
        uint256 ethBefore = trader.balance;
        uint256 prioBefore = token.balanceOf(trader);
        swapLimited(true, int256(100 ether), price - price / 1000, 1_000 ether);
        uint256 got = token.balanceOf(trader) - prioBefore;
        assertLt(got, 100 ether, "the limit cut the fill short");
        uint256 fee = treasury.totalIncome();
        uint256 leg = (ethBefore - trader.balance) - fee;
        assertEq(fee, hook.feeOnLeg(leg), "fee follows the executed ETH leg");

        // Sell exact input, limit just above the price.
        price = currentPrice();
        uint256 income = treasury.totalIncome();
        ethBefore = trader.balance;
        prioBefore = token.balanceOf(trader);
        swapLimited(false, -int256(100 ether), price + price / 1000, 0);
        assertLt(prioBefore - token.balanceOf(trader), 100 ether, "the limit cut the fill short");
        fee = treasury.totalIncome() - income;
        leg = (trader.balance - ethBefore) + fee;
        assertEq(fee, hook.feeOnLeg(leg), "fee follows the executed ETH leg");
    }

    function test_redeemZeroRefused() public {
        vm.expectRevert(TreasuryFeeHook.NothingToRedeem.selector);
        hook.redeemClaims(0);
    }

    // ------------------------------------------------------------------ other pools carry no fee

    /// @dev A hookless ETH/PRIO pool on the same manager trades with no extra fee: the hook only sees its own.
    function test_hooklessEthPrioPoolPaysNoHookFee() public {
        PoolKey memory plain = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(address(token)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
        manager.initialize(plain, SQRT_PRICE_1_1);
        vm.startPrank(factory);
        vm.deal(factory, 1_000 ether);
        token.approve(address(lpRouter), type(uint256).max);
        lpRouter.modifyLiquidity{value: 200 ether}(
            plain,
            ModifyLiquidityParams(TickMath.minUsableTick(60), TickMath.maxUsableTick(60), 100 ether, bytes32(0)),
            ""
        );
        vm.stopPrank();

        uint256 charged = hook.totalFeeCharged();
        uint256 income = treasury.totalIncome();
        vm.startPrank(trader);
        token.approve(address(swapRouter), type(uint256).max);
        swapRouter.swap{value: 1 ether}(
            plain, SwapParams(true, -1 ether, TickMath.MIN_SQRT_PRICE + 1), PoolSwapTest.TestSettings(false, false), ""
        );
        swapRouter.swap(
            plain, SwapParams(false, -1 ether, TickMath.MAX_SQRT_PRICE - 1), PoolSwapTest.TestSettings(false, false), ""
        );
        vm.stopPrank();
        assertEq(hook.totalFeeCharged(), charged, "no fee on another pool");
        assertEq(treasury.totalIncome(), income);
    }

    /// @dev A swap on a pool key that names the hook but is not the hook's pool is refused by the hook.
    function test_swapOnForeignKeyNamingTheHookIsRefused() public {
        PoolKey memory forged = key;
        forged.fee = 3000;
        vm.startPrank(trader);
        token.approve(address(swapRouter), type(uint256).max);
        vm.expectRevert();
        swapRouter.swap{value: 1 ether}(
            forged, SwapParams(true, -1 ether, TickMath.MIN_SQRT_PRICE + 1), PoolSwapTest.TestSettings(false, false), ""
        );
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ nothing can change the fee

    function test_noFeeOrTreasurySetterExists() public {
        string[6] memory sigs = [
            "setFee(uint256)",
            "setFeeBps(uint256)",
            "setTreasury(address)",
            "pause()",
            "disableFee()",
            "setPoolKey((address,address,uint24,int24,address))"
        ];
        for (uint256 i; i < sigs.length; i++) {
            vm.prank(owner);
            (bool ok,) = address(hook).call(abi.encodeWithSignature(sigs[i], uint256(0)));
            assertFalse(ok, sigs[i]);
        }
        assertEq(hook.FEE_BPS(), 50);
        assertEq(hook.treasury(), address(treasury));
    }

    function test_ownershipIsTwoStepAndNotRenounceable() public {
        address next = makeAddr("next");
        vm.prank(owner);
        vm.expectRevert(TwoStepOwned.RenunciationDisabled.selector);
        hook.renounceOwnership();
        vm.prank(owner);
        hook.transferOwnership(next);
        assertEq(hook.owner(), owner, "nothing moves until accepted");
        assertEq(hook.pendingOwner(), next);
        vm.prank(trader);
        vm.expectRevert();
        hook.acceptOwnership();
        vm.prank(next);
        hook.acceptOwnership();
        assertEq(hook.owner(), next);
        vm.prank(owner);
        vm.expectRevert();
        hook.transferOwnership(owner);
    }

    /// @dev The constructor refuses every zero address it is given.
    function test_constructorRefusesZeroAddresses() public {
        address at = hookAddress("zero");
        bytes memory creation = abi.encodePacked(
            type(TreasuryFeeHook).creationCode, abi.encode(IPoolManager(address(0)), address(token), factory, owner)
        );
        vm.etch(at, creation);
        (bool ok,) = at.call("");
        assertFalse(ok, "zero pool manager");
        creation = abi.encodePacked(
            type(TreasuryFeeHook).creationCode, abi.encode(IPoolManager(address(manager)), address(0), factory, owner)
        );
        vm.etch(at, creation);
        (ok,) = at.call("");
        assertFalse(ok, "zero token");
        creation = abi.encodePacked(
            type(TreasuryFeeHook).creationCode,
            abi.encode(IPoolManager(address(manager)), address(token), address(0), owner)
        );
        vm.etch(at, creation);
        (ok,) = at.call("");
        assertFalse(ok, "zero factory");
    }
}

/// @dev Launches with no treasury bound; each test seeds the pool as it needs.
contract TreasuryFeeHookUnboundTest is Fixture {
    function setUp() public {
        deployLaunch(false);
        vm.prank(factory);
        token.transfer(trader, 10_000_000 ether);
    }

    // ------------------------------------------------------------------ the treasury cannot take ETH

    /// @dev The hook's treasury is bound but the treasury has not bound the hook, so it refuses ETH: the
    /// swap still succeeds, the fee waits in `pendingEth`, and anyone delivers it once it can be received.
    function test_treasuryRefusingEthNeverRevertsTheSwapAndFeeIsKept() public {
        vm.prank(owner);
        hook.bindTreasury(payable(address(treasury)));
        seedLiquidity(10_000 ether, true);
        vm.deal(trader, 100 ether);

        (uint256 fee,) = hook.quoteBuyExactInput(1 ether);
        swap(trader, true, -1 ether, 1 ether);
        assertEq(hook.pendingEth(), fee, "fee kept by the hook");
        assertEq(address(hook).balance, fee);
        assertEq(treasury.totalIncome(), 0);
        assertEq(hook.totalFeeCharged(), fee);
        assertEq(hook.totalFeeDelivered(), 0);

        // Still refused: flush is a no-op that keeps the ETH, never a revert.
        vm.prank(trader);
        hook.flush();
        assertEq(hook.pendingEth(), fee);

        vm.prank(owner);
        treasury.bindHook(address(hook));
        vm.prank(trader);
        hook.flush();
        assertEq(hook.pendingEth(), 0);
        assertEq(treasury.totalIncome(), fee);
        assertEq(hook.totalFeeDelivered(), fee);
    }

    function test_flushRevertsWhenNoTreasuryBound() public {
        vm.expectRevert(TreasuryFeeHook.TreasuryNotBound.selector);
        hook.flush();
    }

    /// @dev Before the treasury is bound the fee waits in the hook, so no fee is ever dropped.
    function test_feesBeforeBindingWaitThenDeliver() public {
        seedLiquidity(10_000 ether, true);
        vm.deal(trader, 100 ether);
        swap(trader, true, -1 ether, 1 ether);
        swap(trader, false, -1 ether, 0);
        uint256 charged = hook.totalFeeCharged();
        assertEq(hook.pendingEth(), charged);
        vm.startPrank(owner);
        hook.bindTreasury(payable(address(treasury)));
        treasury.bindHook(address(hook));
        vm.stopPrank();
        hook.flush();
        assertEq(treasury.totalIncome(), charged);
        assertEq(hook.totalFeeDelivered(), charged);
    }

    // ------------------------------------------------------------------ claims the manager cannot cover

    function test_redeemClaimsRevertsWhenManagerHoldsLessEthThanAsked() public {
        seedLiquidity(10_000 ether, false);
        vm.deal(trader, 100 ether);
        vm.startPrank(owner);
        hook.bindTreasury(payable(address(treasury)));
        treasury.bindHook(address(hook));
        vm.stopPrank();

        swap(trader, true, -1 ether, 1 ether);
        uint256 claims = hook.pendingClaims();
        assertGt(claims, 0);
        // The manager keeps the LP fee share of every swap, so trading alone cannot drain it below the claim;
        // model a manager that holds less than the claim directly.
        uint256 managerEth = address(manager).balance;
        vm.deal(address(manager), claims - 1);
        vm.expectRevert();
        hook.redeemClaims(claims);
        assertEq(hook.pendingClaims(), claims, "nothing redeemed, nothing lost");
        vm.deal(address(manager), managerEth);

        // A partial redemption the manager can cover works; the remainder keeps waiting.
        hook.redeemClaims(claims / 2);
        assertEq(hook.pendingClaims(), claims - claims / 2);
        assertEq(treasury.totalIncome(), claims / 2);
        hook.redeemClaims(claims - claims / 2);
        assertEq(hook.pendingClaims(), 0);
        assertEq(hook.totalFeeCharged(), hook.totalFeeDelivered() + hook.pendingClaims() + hook.pendingEth());
    }
}
