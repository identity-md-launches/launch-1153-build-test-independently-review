// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {TwoStepOwned} from "./TwoStepOwned.sol";

/// @title TreasuryFeeHook: an immutable extra 0.5% ETH fee on every buy and sell in the ETH/PRIO pool
/// @notice The hook charges `FEE_BPS` (50 bps, 0.5%) of the ETH leg of each swap in its one pool, on top of the
/// pool's LP fee and the platform's own fees, which the PoolManager accounts separately. The fee is always
/// taken on the ETH side, never in PRIO:
///   - buy, exact input  (ETH specified):  taken in `beforeSwap` from the ETH input; the pool swaps the rest.
///   - buy, exact output (PRIO specified): taken in `afterSwap` on top of the ETH the pool charged.
///   - sell, exact input (PRIO specified): taken in `afterSwap` out of the ETH the pool paid.
///   - sell, exact output (ETH specified): taken in `beforeSwap` by asking the pool for more ETH, so the
///     swapper still receives exactly the ETH it asked for.
/// In every case the fee is 0.5% of the ETH amount the pool itself exchanged ("the ETH leg"), rounded up to
/// the next wei, so it never compounds with itself or with LP and protocol fees.
///
/// Delivery: when the PoolManager already holds enough ETH the fee is taken as native ETH into this contract
/// and forwarded to the bound `FeeTreasury` in the same swap. When it does not (a fresh pool seeded with
/// tokens only, or a sell that drains the manager's ETH), the hook mints itself an ERC-6909 ETH claim
/// instead, and anyone may later call `redeemClaims()` to turn the claim into ETH for the treasury. Nothing
/// in either path can revert a swap because of the treasury, and the fee is never dropped.
///
/// Ordinary PRIO transfers carry no fee (the token is standard), and the hook refuses to initialize any pool
/// except its own ETH/PRIO pool, so no other pool can be hooked to it.
contract TreasuryFeeHook is IHooks, IUnlockCallback, TwoStepOwned {
    using CurrencyLibrary for Currency;
    using BeforeSwapDeltaLibrary for BeforeSwapDelta;

    // ------------------------------------------------------------------ constants

    /// @notice The extra fee, in basis points of the ETH leg. Immutable by construction: no setter exists.
    uint256 public constant FEE_BPS = 50;
    uint256 public constant BPS = 10_000;

    // ------------------------------------------------------------------ immutables

    IPoolManager public immutable poolManager;
    /// @notice The launch token. Only a pool of native ETH against it may be initialized on this hook.
    address public immutable token;
    /// @notice The launch factory: the only address allowed to open the pool.
    address public immutable factory;

    // ------------------------------------------------------------------ state

    /// @notice The one pool this hook serves, recorded at initialization.
    PoolKey internal _poolKey;
    PoolId public poolId;
    bool public initialized;

    /// @notice Where every fee goes. Bound once by the owner; immutable afterwards.
    address payable public treasury;

    /// @notice Fee ETH held by this contract because the treasury was not bound or could not accept it.
    uint256 public pendingEth;
    /// @notice Fee ETH held as an ERC-6909 claim on the PoolManager, not yet redeemed.
    uint256 public pendingClaims;
    /// @notice Lifetime fee charged, in wei, over both delivery paths.
    uint256 public totalFeeCharged;
    /// @notice Lifetime fee delivered to the treasury, in wei.
    uint256 public totalFeeDelivered;

    // ------------------------------------------------------------------ events / errors

    event PoolInitialized(PoolId indexed id, uint24 fee, int24 tickSpacing);
    event TreasuryBound(address indexed treasury);
    event FeeCharged(PoolId indexed id, bool zeroForOne, bool exactInput, uint256 ethLeg, uint256 fee, bool asClaim);
    event FeeDelivered(address indexed treasury, uint256 amount);
    event ClaimsRedeemed(uint256 amount);

    error NotPoolManager();
    error NotFactory();
    error AlreadyInitialized();
    error NotInitialized();
    error WrongPool();
    error DynamicFeeNotAllowed();
    error TreasuryAlreadyBound();
    error TreasuryNotBound();
    error ZeroAddress();
    error HookNotImplemented();
    error NothingToRedeem();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    /// @param poolManager_ The chain's Uniswap v4 PoolManager ("$poolManager" in the manifest).
    /// @param token_ The launch token ("$token").
    /// @param factory_ The launch factory that opens the pool ("$factory").
    /// @param owner_ The project owner ("$owner"): binds the treasury, nothing else.
    constructor(IPoolManager poolManager_, address token_, address factory_, address owner_) TwoStepOwned(owner_) {
        if (address(poolManager_) == address(0) || token_ == address(0) || factory_ == address(0)) {
            revert ZeroAddress();
        }
        poolManager = poolManager_;
        token = token_;
        factory = factory_;
        // Fails deployment if the permissions do not match the address this bytecode was mined for.
        Hooks.validateHookPermissions(this, getHookPermissions());
    }

    // ------------------------------------------------------------------ permissions

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ------------------------------------------------------------------ views

    function poolKey() external view returns (PoolKey memory) {
        return _poolKey;
    }

    /// @notice The fee for a given ETH leg: 0.5%, rounded up to the next wei.
    function feeOnLeg(uint256 ethLeg) public pure returns (uint256) {
        return (ethLeg * FEE_BPS + (BPS - 1)) / BPS;
    }

    /// @notice For a buy with exact ETH input `grossIn`: the fee taken and the ETH the pool will swap.
    /// @dev fee = 0.5% of the pool leg, so pool leg = grossIn / 1.005 and fee = grossIn - poolLeg,
    /// computed as ceil(grossIn * 50 / 10050).
    function quoteBuyExactInput(uint256 grossIn) public pure returns (uint256 fee, uint256 poolLeg) {
        fee = (grossIn * FEE_BPS + (BPS + FEE_BPS - 1)) / (BPS + FEE_BPS);
        poolLeg = grossIn - fee;
    }

    /// @notice For a sell with exact ETH output `netOut`: the fee and the ETH the pool must pay out.
    /// @dev fee = 0.5% of the pool leg (netOut + fee), so fee = ceil(netOut * 50 / 9950).
    function quoteSellExactOutput(uint256 netOut) public pure returns (uint256 fee, uint256 poolLeg) {
        fee = (netOut * FEE_BPS + (BPS - FEE_BPS - 1)) / (BPS - FEE_BPS);
        poolLeg = netOut + fee;
    }

    // ------------------------------------------------------------------ owner

    /// @notice Binds the FeeTreasury once. Fees charged before binding wait in `pendingEth` / claims.
    function bindTreasury(address payable treasury_) external onlyOwner {
        if (treasury != address(0)) revert TreasuryAlreadyBound();
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryBound(treasury_);
    }

    // ------------------------------------------------------------------ permissionless delivery

    /// @notice Forwards ETH held here to the treasury. Anyone may call it; it only moves fee ETH.
    function flush() public {
        if (treasury == address(0)) revert TreasuryNotBound();
        uint256 amount = pendingEth;
        if (amount == 0) return;
        pendingEth = 0;
        (bool ok,) = treasury.call{value: amount}("");
        if (!ok) {
            pendingEth = amount;
            return;
        }
        totalFeeDelivered += amount;
        emit FeeDelivered(treasury, amount);
    }

    /// @notice Burns the hook's ERC-6909 ETH claims for native ETH and forwards it to the treasury.
    /// @dev Needs the PoolManager to hold at least `amount` ETH; redeem what it can cover.
    function redeemClaims(uint256 amount) external {
        if (treasury == address(0)) revert TreasuryNotBound();
        if (amount == 0 || amount > pendingClaims) revert NothingToRedeem();
        poolManager.unlock(abi.encode(amount));
        flush();
    }

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        uint256 amount = abi.decode(data, (uint256));
        pendingClaims -= amount;
        poolManager.burn(address(this), CurrencyLibrary.ADDRESS_ZERO.toId(), amount);
        poolManager.take(CurrencyLibrary.ADDRESS_ZERO, address(this), amount);
        pendingEth += amount;
        emit ClaimsRedeemed(amount);
        return "";
    }

    receive() external payable {}

    // ------------------------------------------------------------------ callbacks

    function beforeInitialize(address sender, PoolKey calldata key, uint160) external onlyPoolManager returns (bytes4) {
        if (sender != factory) revert NotFactory();
        if (initialized) revert AlreadyInitialized();
        if (!key.currency0.isAddressZero() || Currency.unwrap(key.currency1) != token) revert WrongPool();
        if (address(key.hooks) != address(this)) revert WrongPool();
        if (LPFeeLibrary.isDynamicFee(key.fee)) revert DynamicFeeNotAllowed();
        _poolKey = key;
        poolId = key.toId();
        initialized = true;
        emit PoolInitialized(poolId, key.fee, key.tickSpacing);
        return IHooks.beforeInitialize.selector;
    }

    /// @dev ETH is always currency0 (address zero sorts first). ETH is the *specified* currency when
    /// (zeroForOne && exactInput) or (!zeroForOne && exactOutput); the fee is then taken here.
    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        _requireOwnPool(key);
        bool exactInput = params.amountSpecified < 0;
        bool ethSpecified = params.zeroForOne == exactInput;
        if (!ethSpecified) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        uint256 fee;
        uint256 leg;
        if (exactInput) {
            // Buy with exact ETH in: the pool gets the input minus the fee.
            (fee, leg) = quoteBuyExactInput(uint256(-params.amountSpecified));
        } else {
            // Sell with exact ETH out: the pool pays out the requested ETH plus the fee.
            (fee, leg) = quoteSellExactOutput(uint256(params.amountSpecified));
        }
        _collect(fee, params.zeroForOne, exactInput, leg);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(uint128(fee)), 0), 0);
    }

    /// @dev ETH is the *unspecified* currency when (zeroForOne && exactOutput) or (!zeroForOne && exactInput);
    /// the fee is then taken here, out of the pool's ETH leg, and charged to the swapper.
    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        _requireOwnPool(key);
        bool exactInput = params.amountSpecified < 0;
        bool ethSpecified = params.zeroForOne == exactInput;
        if (ethSpecified) return (IHooks.afterSwap.selector, 0);

        int128 ethDelta = delta.amount0();
        uint256 leg = ethDelta < 0 ? uint256(uint128(-ethDelta)) : uint256(uint128(ethDelta));
        uint256 fee = feeOnLeg(leg);
        if (fee == 0) return (IHooks.afterSwap.selector, 0);
        _collect(fee, params.zeroForOne, exactInput, leg);
        return (IHooks.afterSwap.selector, int128(uint128(fee)));
    }

    // ------------------------------------------------------------------ unused callbacks (never enabled)

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    // ------------------------------------------------------------------ internals

    function _requireOwnPool(PoolKey calldata key) internal view {
        if (!initialized) revert NotInitialized();
        if (PoolId.unwrap(key.toId()) != PoolId.unwrap(poolId)) revert WrongPool();
    }

    /// @dev Settles the hook's positive ETH delta of `fee`: native ETH when the manager can pay it, a claim
    /// otherwise. Then tries to hand native ETH to the treasury without ever reverting the swap.
    function _collect(uint256 fee, bool zeroForOne, bool exactInput, uint256 leg) internal {
        totalFeeCharged += fee;
        bool asClaim = address(poolManager).balance < fee;
        if (asClaim) {
            poolManager.mint(address(this), CurrencyLibrary.ADDRESS_ZERO.toId(), fee);
            pendingClaims += fee;
        } else {
            poolManager.take(CurrencyLibrary.ADDRESS_ZERO, address(this), fee);
            pendingEth += fee;
            if (treasury != address(0)) flush();
        }
        emit FeeCharged(poolId, zeroForOne, exactInput, leg, fee, asClaim);
    }
}
