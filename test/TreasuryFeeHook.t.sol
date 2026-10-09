// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {TreasuryFeeHook} from "../src/TreasuryFeeHook.sol";
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

    function test_treasuryBindsOnce() public {
        vm.prank(owner);
        vm.expectRevert(TreasuryFeeHook.TreasuryAlreadyBound.selector);
        hook.bindTreasury(payable(address(1)));
        vm.prank(trader);
        vm.expectRevert();
        hook.bindTreasury(payable(address(1)));
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
