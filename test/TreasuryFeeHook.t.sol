// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {TreasuryFeeHook} from "../src/TreasuryFeeHook.sol";
import {FeeTreasury} from "../src/FeeTreasury.sol";
import {PrismRiotToken} from "../src/PrismRiotToken.sol";

contract TreasuryFeeHookTest is Fixture {
    function setUp() public {
        deployLaunch(true);
        seedLiquidity(10_000 ether, true);
        vm.deal(trader, 1_000 ether);
        vm.prank(factory);
        token.transfer(trader, 10_000_000 ether);
    }

    // ------------------------------------------------------------------ configuration

    function test_permissionsAndAddressAgree() public view {
        Hooks.Permissions memory p = hook.getHookPermissions();
        assertTrue(
            p.beforeInitialize && p.beforeSwap && p.afterSwap && p.beforeSwapReturnDelta && p.afterSwapReturnDelta
        );
        assertFalse(p.afterInitialize || p.beforeAddLiquidity || p.afterAddLiquidity || p.beforeDonate || p.afterDonate);
        assertEq(uint160(address(hook)) & 0x3FFF, HOOK_FLAGS);
        assertEq(hook.FEE_BPS(), 50);
        assertEq(hook.treasury(), address(treasury));
        assertTrue(hook.initialized());
    }

    function test_constructorRefusesMismatchedAddress() public {
        address wrong = address(uint160(uint256(keccak256("wrong"))) & ~uint160(0x3FFF));
        bytes memory creation = abi.encodePacked(
            type(TreasuryFeeHook).creationCode,
            abi.encode(IPoolManager(address(manager)), address(token), factory, owner)
        );
        vm.etch(wrong, creation);
        (bool ok,) = wrong.call("");
        assertFalse(ok, "a hook at an address without its flags must not deploy");
    }

    /// @dev Finding 51cd3194: a wrong binding can be corrected until the first fee has been delivered.
    function test_treasuryBindingIsCorrectableUntilFirstDelivery_thenImmutable() public {
        vm.prank(trader);
        vm.expectRevert();
        hook.bindTreasury(payable(address(1)));
        // A FeeTreasury bound to another hook is refused outright.
        FeeTreasury other = new FeeTreasury(IPoolManager(address(manager)), owner);
        vm.startPrank(owner);
        other.bindHook(address(0xBEEF));
        vm.expectRevert(TreasuryFeeHook.TreasuryMismatch.selector);
        hook.bindTreasury(payable(address(other)));
        // An unbound one, or a plain address, is accepted and can still be corrected.
        hook.bindTreasury(payable(address(1)));
        hook.bindTreasury(payable(address(treasury)));
        vm.stopPrank();
        swap(trader, true, -1 ether, 1 ether);
        assertGt(hook.totalFeeDelivered(), 0);
        vm.prank(owner);
        vm.expectRevert(TreasuryFeeHook.TreasuryAlreadyBound.selector);
        hook.bindTreasury(payable(address(1)));
    }

    /// @dev Finding 0e9dfff6: stray ETH can no longer be stuck in the hook.
    function test_receiveRefusesEveryoneButThePoolManager() public {
        vm.prank(trader);
        (bool ok,) = address(hook).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(hook).balance, 0);
    }

    /// @dev Finding 561d3594: a 1-wei buy (whole input would be fee, nothing left to swap) is refused, not
    /// swallowed; from 2 wei up the fee is 1 wei (rounded up) on the rest.
    function test_oneWeiBuyIsRefusedNotSwallowed() public {
        vm.prank(trader);
        vm.expectRevert();
        swapRouter.swap{value: 1}(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -1, sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}),
            PoolSwapTest.TestSettings(false, false),
            ""
        );
        assertEq(hook.totalFeeCharged(), 0);
        BalanceDelta d = swap(trader, true, -2, 2);
        assertEq(hook.totalFeeCharged(), 1, "2 wei: 1 wei fee on a 1 wei leg");
        assertEq(d.amount0(), -2);
    }

    function test_callbacksRefuseNonManager() public {
        vm.expectRevert(TreasuryFeeHook.NotPoolManager.selector);
        hook.beforeInitialize(factory, key, SQRT_PRICE_1_1);
        vm.expectRevert(TreasuryFeeHook.NotPoolManager.selector);
        hook.beforeSwap(address(this), key, SwapParams(true, -1 ether, SQRT_PRICE_1_1 / 2), "");
        vm.expectRevert(TreasuryFeeHook.NotPoolManager.selector);
        hook.afterSwap(address(this), key, SwapParams(true, -1 ether, SQRT_PRICE_1_1 / 2), BalanceDelta.wrap(0), "");
        vm.expectRevert(TreasuryFeeHook.NotPoolManager.selector);
        hook.unlockCallback(abi.encode(uint256(1)));
    }

    function test_initializeRefusesNonFactoryAndOtherPools() public {
        // A second pool on the same hook, from the factory: refused (already initialized).
        PoolKey memory other = key;
        other.fee = 3000;
        vm.prank(factory);
        vm.expectRevert();
        manager.initialize(other, SQRT_PRICE_1_1);
    }

    function test_initializeOnFreshHookRefusesWrongPair() public {
        TreasuryFeeHook fresh = deployHookAt(hookAddress("fresh"));
        PrismRiotToken otherToken = new PrismRiotToken();
        PoolKey memory bad = PoolKey(
            CurrencyLibrary.ADDRESS_ZERO,
            Currency.wrap(address(otherToken)),
            POOL_FEE,
            TICK_SPACING,
            IHooks(address(fresh))
        );
        vm.prank(factory);
        vm.expectRevert();
        manager.initialize(bad, SQRT_PRICE_1_1);
        // Not the factory: refused.
        PoolKey memory good = PoolKey(
            CurrencyLibrary.ADDRESS_ZERO, Currency.wrap(address(token)), POOL_FEE, TICK_SPACING, IHooks(address(fresh))
        );
        vm.prank(trader);
        vm.expectRevert();
        manager.initialize(good, SQRT_PRICE_1_1);
        // Dynamic fee: refused.
        good.fee = LPFeeLibrary.DYNAMIC_FEE_FLAG;
        vm.prank(factory);
        vm.expectRevert();
        manager.initialize(good, SQRT_PRICE_1_1);
        // The factory, the right pair and a listed fee: accepted.
        good.fee = POOL_FEE;
        vm.prank(factory);
        manager.initialize(good, SQRT_PRICE_1_1);
        assertTrue(fresh.initialized());
    }

    // ------------------------------------------------------------------ the four swap shapes

    function test_buyExactInput_feeFromEthInput() public {
        uint256 grossIn = 1 ether;
        (uint256 fee, uint256 leg) = hook.quoteBuyExactInput(grossIn);
        uint256 ethBefore = trader.balance;
        uint256 prioBefore = token.balanceOf(trader);
        BalanceDelta d = swap(trader, true, -int256(grossIn), grossIn);
        assertEq(ethBefore - trader.balance, grossIn, "swapper pays exactly the gross input");
        assertGt(token.balanceOf(trader) - prioBefore, 0);
        assertEq(uint256(uint128(-d.amount0())), grossIn);
        assertEq(treasury.totalIncome(), fee, "fee delivered to the treasury in the swap");
        assertEq(hook.totalFeeCharged(), fee);
        assertEq(fee, (leg * 50 + 9_999) / 10_000, "fee is 0.5% of the pool leg, rounded up");
    }

    function test_buyExactOutput_feeOnTopOfEthCharged() public {
        uint256 want = 10 ether;
        uint256 prioBefore = token.balanceOf(trader);
        uint256 ethBefore = trader.balance;
        BalanceDelta d = swap(trader, true, int256(want), 100 ether);
        assertEq(token.balanceOf(trader) - prioBefore, want, "exact PRIO out");
        uint256 paid = ethBefore - trader.balance;
        assertEq(paid, uint256(uint128(-d.amount0())));
        uint256 fee = treasury.totalIncome();
        uint256 leg = paid - fee;
        assertEq(fee, hook.feeOnLeg(leg), "fee is 0.5% of the pool's ETH leg");
        assertGt(fee, 0);
    }

    function test_sellExactInput_feeOutOfEthOutput() public {
        uint256 prioIn = 1_000 ether;
        uint256 ethBefore = trader.balance;
        BalanceDelta d = swap(trader, false, -int256(prioIn), 0);
        uint256 received = trader.balance - ethBefore;
        assertEq(received, uint256(uint128(d.amount0())));
        uint256 fee = treasury.totalIncome();
        uint256 leg = received + fee;
        assertEq(fee, hook.feeOnLeg(leg));
        assertGt(fee, 0);
    }

    function test_sellExactOutput_swapperGetsExactlyTheEthAsked() public {
        uint256 wantEth = 1 ether;
        (uint256 fee, uint256 leg) = hook.quoteSellExactOutput(wantEth);
        uint256 ethBefore = trader.balance;
        swap(trader, false, int256(wantEth), 0);
        assertEq(trader.balance - ethBefore, wantEth, "exact ETH out, fee paid by the pool leg");
        assertEq(treasury.totalIncome(), fee);
        assertEq(fee, hook.feeOnLeg(leg), "0.5% of the enlarged pool leg");
    }

    function test_otherDirectionsLeaveTokenTransfersUntaxed() public {
        vm.prank(trader);
        token.transfer(owner, 1 ether);
        assertEq(token.balanceOf(owner), 1 ether);
        assertEq(treasury.totalIncome(), 0);
    }

    // ------------------------------------------------------------------ rounding

    function testFuzz_quotesAreConsistentWeiLevel(uint128 amount) public view {
        vm.assume(amount > 1);
        (uint256 feeIn, uint256 legIn) = hook.quoteBuyExactInput(amount);
        assertEq(feeIn + legIn, amount);
        // fee is 0.5% of the leg, rounded up, within one wei of the exact fraction.
        assertGe(feeIn * 10_000, legIn * 50);
        assertLe(feeIn * 10_000, legIn * 50 + 10_050);
        (uint256 feeOut, uint256 legOut) = hook.quoteSellExactOutput(amount);
        assertEq(legOut - feeOut, amount);
        assertGe(feeOut * 10_000 + 10_000, legOut * 50);
        assertLe(feeOut * 10_000, legOut * 50 + 9_950);
        assertEq(hook.feeOnLeg(amount), (uint256(amount) * 50 + 9_999) / 10_000);
    }

    function test_feeOnLegRoundsUpAtWeiLevel() public view {
        assertEq(hook.feeOnLeg(1), 1);
        assertEq(hook.feeOnLeg(200), 1);
        assertEq(hook.feeOnLeg(201), 2);
        assertEq(hook.feeOnLeg(0), 0);
    }

    function testFuzz_feeChargedMatchesTreasuryIncome(uint96 amount, bool zeroForOne, bool exactIn) public {
        amount = uint96(bound(amount, 1e6, 100 ether));
        int256 spec = exactIn ? -int256(uint256(amount)) : int256(uint256(amount));
        swap(trader, zeroForOne, spec, zeroForOne ? 500 ether : 0);
        assertEq(hook.totalFeeCharged(), treasury.totalIncome(), "every wei charged reaches the treasury");
        assertEq(hook.pendingEth(), 0);
        assertEq(hook.pendingClaims(), 0);
        assertGt(treasury.totalIncome(), 0);
    }
}

/// @dev Finding b4f3e5c7: ETH-specified swaps that the pool fills only partly (price limit or liquidity
/// exhausted) must pay 0.5% of the ETH leg actually exchanged, and a seller must never pay ETH.
contract TreasuryFeeHookPartialFillTest is Fixture {
    using StateLibrary for IPoolManager;

    function setUp() public {
        deployLaunch(true);
        // A thin pool: liquidity only in [-60, +60] around 1:1 (about 3 ETH of depth each side).
        vm.startPrank(factory);
        token.approve(address(lpRouter), type(uint256).max);
        vm.deal(factory, 1_000 ether);
        lpRouter.modifyLiquidity{value: 10 ether}(key, ModifyLiquidityParams(-60, 60, int256(1e21), bytes32(0)), "");
        vm.stopPrank();
        vm.deal(trader, 1_000 ether);
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

    function test_buyExactInput_liquidityExhausted_feeIsHalfPercentOfFilledLeg() public {
        uint256 ethBefore = trader.balance;
        BalanceDelta d = swapLimited(true, -100 ether, TickMath.MIN_SQRT_PRICE + 1, 100 ether);
        uint256 paid = uint256(uint128(-d.amount0()));
        assertEq(ethBefore - trader.balance, paid, "the router returned the unfilled ETH");
        uint256 fee = treasury.totalIncome();
        uint256 leg = paid - fee;
        assertLt(leg, 4 ether, "only about 3 ETH could be filled");
        assertEq(fee, hook.feeOnLeg(leg), "exactly 0.5% of the filled leg");
        assertEq(hook.totalFeeCharged(), fee);
    }

    function test_buyExactInput_priceLimit_feeIsHalfPercentOfFilledLeg() public {
        (uint160 price,,,) = IPoolManager(address(manager)).getSlot0(key.toId());
        uint160 limit = price - price / 400; // about 0.5% below spot
        BalanceDelta d = swapLimited(true, -100 ether, limit, 100 ether);
        uint256 paid = uint256(uint128(-d.amount0()));
        uint256 fee = treasury.totalIncome();
        assertEq(fee, hook.feeOnLeg(paid - fee));
        (uint160 after_,,,) = IPoolManager(address(manager)).getSlot0(key.toId());
        assertEq(after_, limit, "the pool stops exactly at the swapper's limit");
    }

    function test_sellExactOutput_liquidityExhausted_sellerNeverPaysEth() public {
        uint256 ethBefore = trader.balance;
        uint256 prioBefore = token.balanceOf(trader);
        BalanceDelta d = swapLimited(false, 1_000 ether, TickMath.MAX_SQRT_PRICE - 1, 10 ether);
        assertGe(d.amount0(), 0, "a seller never pays ETH");
        uint256 received = uint256(uint128(d.amount0()));
        assertEq(trader.balance - ethBefore, received);
        assertLt(token.balanceOf(trader), prioBefore);
        uint256 fee = treasury.totalIncome();
        assertEq(fee, hook.feeOnLeg(received + fee), "0.5% of the ETH the pool paid");
    }

    function test_sellExactOutput_priceLimit_feeIsHalfPercentOfFilledLeg() public {
        (uint160 price,,,) = IPoolManager(address(manager)).getSlot0(key.toId());
        uint160 limit = price + price / 400;
        BalanceDelta d = swapLimited(false, 100 ether, limit, 0);
        uint256 received = uint256(uint128(d.amount0()));
        uint256 fee = treasury.totalIncome();
        assertEq(fee, hook.feeOnLeg(received + fee));
    }

    function test_fullFillsStillCostExactlyWhatWasSpecified() public {
        uint256 ethBefore = trader.balance;
        swapLimited(true, -1 ether, TickMath.MIN_SQRT_PRICE + 1, 1 ether);
        assertEq(ethBefore - trader.balance, 1 ether);
        (uint256 fee,) = hook.quoteBuyExactInput(1 ether);
        assertEq(treasury.totalIncome(), fee);
        ethBefore = trader.balance;
        swapLimited(false, 1 ether, TickMath.MAX_SQRT_PRICE - 1, 0);
        assertEq(trader.balance - ethBefore, 1 ether);
    }

    function test_limitNextToSpotMovesNothingAndChargesNothing() public {
        (uint160 price,,,) = IPoolManager(address(manager)).getSlot0(key.toId());
        BalanceDelta d = swapLimited(true, -1 ether, price - 1, 1 ether);
        assertLe(uint256(uint128(-d.amount0())), 10, "one sqrt-price unit exchanges a few wei at most");
        assertEq(hook.totalFeeCharged(), 0);
    }

    function testFuzz_partialFillFeeIsAlwaysOnTheFilledLeg(uint96 amount, bool buy) public {
        amount = uint96(bound(amount, 1e9, 500 ether));
        BalanceDelta d = buy
            ? swapLimited(true, -int256(uint256(amount)), TickMath.MIN_SQRT_PRICE + 1, amount)
            : swapLimited(false, int256(uint256(amount)), TickMath.MAX_SQRT_PRICE - 1, 0);
        uint256 fee = treasury.totalIncome();
        uint256 leg = buy ? uint256(uint128(-d.amount0())) - fee : uint256(uint128(d.amount0())) + fee;
        if (buy) {
            assertGe(d.amount0(), -int256(uint256(amount)), "never pays more than specified");
        } else {
            assertTrue(d.amount0() >= 0 && d.amount0() <= int256(uint256(amount)), "receives at most what was asked");
        }
        assertLe(fee, hook.feeOnLeg(leg) + 1, "within a wei of 0.5% of the leg");
        assertGe(fee, hook.feeOnLeg(leg));
        assertEq(hook.totalFeeCharged(), fee);
    }
}

/// @dev A fresh manager seeded with PRIO only: the fee is minted as an ERC-6909 claim and redeemed later.
contract TreasuryFeeHookClaimsTest is Fixture {
    function setUp() public {
        deployLaunch(false);
        seedLiquidity(10_000 ether, false);
        vm.deal(trader, 1_000 ether);
    }

    function test_buyOnTokenOnlyPoolMintsClaimThenRedeems() public {
        assertEq(address(manager).balance, 0);
        uint256 grossIn = 1 ether;
        (uint256 fee,) = hook.quoteBuyExactInput(grossIn);
        swap(trader, true, -int256(grossIn), grossIn);
        assertEq(hook.pendingClaims(), fee, "fee held as a claim, the swap did not revert");
        assertEq(manager.balanceOf(address(hook), 0), fee);
        assertEq(hook.totalFeeCharged(), fee);

        // Unbound treasury: nothing can be redeemed yet, and the fee waits.
        vm.expectRevert(TreasuryFeeHook.TreasuryNotBound.selector);
        hook.redeemClaims(fee);

        vm.startPrank(owner);
        hook.bindTreasury(payable(address(treasury)));
        treasury.bindHook(address(hook));
        vm.stopPrank();

        // The manager now holds the buyer's ETH, so the claim can be redeemed by anyone.
        vm.prank(trader);
        hook.redeemClaims(fee);
        assertEq(hook.pendingClaims(), 0);
        assertEq(hook.pendingEth(), 0);
        assertEq(treasury.totalIncome(), fee);
        assertEq(hook.totalFeeDelivered(), fee);
    }

    function test_secondBuyPaysDirectlyOnceManagerHoldsEth() public {
        vm.startPrank(owner);
        hook.bindTreasury(payable(address(treasury)));
        treasury.bindHook(address(hook));
        vm.stopPrank();
        swap(trader, true, -1 ether, 1 ether);
        uint256 claims = hook.pendingClaims();
        assertGt(claims, 0);
        swap(trader, true, -1 ether, 1 ether);
        assertEq(hook.pendingClaims(), claims, "second buy paid in native ETH");
        assertGt(treasury.totalIncome(), 0);
        assertEq(hook.totalFeeCharged(), treasury.totalIncome() + claims);
    }

    function test_redeemRefusesMoreThanHeld() public {
        vm.startPrank(owner);
        hook.bindTreasury(payable(address(treasury)));
        vm.stopPrank();
        vm.expectRevert(TreasuryFeeHook.NothingToRedeem.selector);
        hook.redeemClaims(1);
    }
}
