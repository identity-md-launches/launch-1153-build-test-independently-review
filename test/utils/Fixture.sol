// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PrismRiotToken} from "../../src/PrismRiotToken.sol";
import {TreasuryFeeHook} from "../../src/TreasuryFeeHook.sol";
import {FeeTreasury} from "../../src/FeeTreasury.sol";

/// @dev Shared launch fixture: a PoolManager, the token, the hook at a flag-matching address, the treasury,
/// the pool opened by the "factory" and (optionally) seeded with liquidity through the v4 test routers.
contract Fixture is Test {
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;
    uint24 constant POOL_FEE = 12500;
    int24 constant TICK_SPACING = 60;

    address owner = makeAddr("owner");
    address factory = makeAddr("factory");
    address trader = makeAddr("trader");

    PoolManager manager;
    PrismRiotToken token;
    TreasuryFeeHook hook;
    FeeTreasury treasury;
    PoolSwapTest swapRouter;
    PoolModifyLiquidityTest lpRouter;
    PoolKey key;

    uint160 constant HOOK_FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    function deployLaunch(bool bindTreasury) internal {
        manager = new PoolManager(address(this));
        vm.prank(factory);
        token = new PrismRiotToken();
        hook = deployHookAt(hookAddress(bytes32("hook")));
        treasury = new FeeTreasury(IPoolManager(address(manager)), owner);
        if (bindTreasury) {
            vm.startPrank(owner);
            hook.bindTreasury(payable(address(treasury)));
            treasury.bindHook(address(hook));
            treasury.setPrio(address(token));
            vm.stopPrank();
        }
        swapRouter = new PoolSwapTest(IPoolManager(address(manager)));
        lpRouter = new PoolModifyLiquidityTest(IPoolManager(address(manager)));
        key = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(address(token)),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });
        vm.prank(factory);
        manager.initialize(key, SQRT_PRICE_1_1);
    }

    /// @dev Creation code run in place at an address whose low bits carry the hook's flags, as the
    /// launch deployer (CREATE2 with a mined salt) will.
    function deployHookAt(address at) internal returns (TreasuryFeeHook) {
        bytes memory creation = abi.encodePacked(
            type(TreasuryFeeHook).creationCode,
            abi.encode(IPoolManager(address(manager)), address(token), factory, owner)
        );
        vm.etch(at, creation);
        (bool ok, bytes memory runtime) = at.call("");
        require(ok, "hook constructor reverted");
        vm.etch(at, runtime);
        return TreasuryFeeHook(payable(at));
    }

    function hookAddress(bytes32 seed) internal pure returns (address) {
        uint160 base = uint160(uint256(keccak256(abi.encode(seed))));
        return address((base & ~uint160(0x3FFF)) | HOOK_FLAGS);
    }

    /// @dev Full-range liquidity from the factory's token balance, ETH alongside when `ethSide` is true.
    function seedLiquidity(uint256 liquidity, bool ethSide) internal {
        vm.startPrank(factory);
        token.approve(address(lpRouter), type(uint256).max);
        if (ethSide) vm.deal(factory, 1_000_000 ether);
        // PRIO is currency1: a range below the current price holds PRIO only; full range holds both.
        int24 lower = TickMath.minUsableTick(TICK_SPACING);
        int24 upper = ethSide ? TickMath.maxUsableTick(TICK_SPACING) : int24(0);
        lpRouter.modifyLiquidity{value: ethSide ? 100_000 ether : 0}(
            key, ModifyLiquidityParams(lower, upper, int256(liquidity), bytes32(0)), ""
        );
        vm.stopPrank();
    }

    function swap(address who, bool zeroForOne, int256 amountSpecified, uint256 value) internal returns (BalanceDelta) {
        vm.startPrank(who);
        token.approve(address(swapRouter), type(uint256).max);
        BalanceDelta d = swapRouter.swap{value: value}(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: amountSpecified,
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings(false, false),
            ""
        );
        vm.stopPrank();
        return d;
    }
}
