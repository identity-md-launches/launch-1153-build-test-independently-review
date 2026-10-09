// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {TwoStepOwned} from "./TwoStepOwned.sol";

interface IFeeHook {
    function poolKey() external view returns (PoolKey memory);
}

interface IRewardSink {
    function notifyReward(uint256 amount) external;
}

interface IPrizeSink {
    function fundPrizes(uint256 amount) external;
}

/// @title FeeTreasury: earned ETH fees, and nothing else, fund the project
/// @notice Only the bound `TreasuryFeeHook` may send ETH here: there is no owner top-up path, so no income
/// means no paid operations. `allocate()` (permissionless) splits every new wei of income:
///   1. gas/operating reserve: at most 10% of the allocation, and only until `reserve` reaches
///      `reserveTarget` (owner-set, capped by `MAX_RESERVE_TARGET`, 2 ETH);
///   2. of the remainder: 30% IMD purchase budget (agent work), 30% PRIO purchase budget (rewards),
///      40% owner budget.
/// Budgets are spent only by the executor through bounded, slippage-checked swaps on the Uniswap v4
/// PoolManager, at most `maxSpendPerSwap` ETH per call. Purchased PRIO is split equally between the
/// StakingVault (reward stream) and the Arena (game pool). Purchased IMD goes to the OracleAdapter.
/// PRIO purchases depend only on the hook's own pool; IMD purchases wait for an owner-set IMD pool key.
/// The reserve pays operator gas (`withdrawReserve`): a fee-funded bootstrap, never an advance.
contract FeeTreasury is IUnlockCallback, TwoStepOwned, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using CurrencyLibrary for Currency;

    uint256 public constant RESERVE_CAP_BPS = 1_000; // 10% of an allocation
    uint256 public constant IMD_BPS = 3_000;
    uint256 public constant PRIO_BPS = 3_000;
    uint256 public constant OWNER_BPS = 4_000;
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_RESERVE_TARGET = 2 ether;

    IPoolManager public immutable poolManager;

    address public hook;
    IERC20 public prio;
    IERC20 public imd;
    address public stakingVault;
    address public arena;
    address public oracleAdapter;
    address public executor;
    uint256 public reserveTarget = 0.5 ether;
    uint256 public maxSpendPerSwap = 1 ether;
    PoolKey internal _imdPoolKey;
    bool public imdPoolSet;

    uint256 public totalIncome;
    uint256 public unallocated;
    uint256 public reserve;
    uint256 public imdBudget;
    uint256 public prioBudget;
    uint256 public ownerBudget;

    event Income(uint256 amount);
    event Allocated(uint256 amount, uint256 toReserve, uint256 toImd, uint256 toPrio, uint256 toOwner);
    event HookBound(address indexed hook);
    event PrioSet(address indexed prio);
    event ImdSet(address indexed imd);
    event SinksSet(address indexed stakingVault, address indexed arena, address indexed oracleAdapter);
    event ExecutorSet(address indexed executor);
    event ReserveTargetSet(uint256 target);
    event MaxSpendSet(uint256 maxSpend);
    event ImdPoolSet(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks);
    event PrioBought(uint256 ethIn, uint256 prioOut, uint256 toStaking, uint256 toArena);
    event ImdBought(uint256 ethIn, uint256 imdOut);
    event OwnerWithdrawn(address indexed to, uint256 amount);
    event ReserveWithdrawn(address indexed to, uint256 amount);

    error NotHook();
    error HookAlreadyBound();
    error AlreadySet();
    error ZeroAddress();
    error NotExecutor();
    error NotConfigured(string what);
    error ExceedsBudget();
    error ExceedsMaxSpend();
    error Slippage();
    error NotPoolManager();
    error TooHigh();
    error TransferFailed();

    constructor(IPoolManager poolManager_, address owner_) TwoStepOwned(owner_) {
        if (address(poolManager_) == address(0)) revert ZeroAddress();
        poolManager = poolManager_;
    }

    // ------------------------------------------------------------------ income

    receive() external payable {
        if (msg.sender != hook) revert NotHook();
        totalIncome += msg.value;
        unallocated += msg.value;
        emit Income(msg.value);
    }

    // ------------------------------------------------------------------ configuration (owner)

    function bindHook(address hook_) external onlyOwner {
        if (hook != address(0)) revert HookAlreadyBound();
        if (hook_ == address(0)) revert ZeroAddress();
        hook = hook_;
        emit HookBound(hook_);
    }

    function setPrio(address prio_) external onlyOwner {
        if (address(prio) != address(0)) revert AlreadySet();
        if (prio_ == address(0)) revert ZeroAddress();
        prio = IERC20(prio_);
        emit PrioSet(prio_);
    }

    function setImd(address imd_) external onlyOwner {
        if (imd_ == address(0)) revert ZeroAddress();
        imd = IERC20(imd_);
        emit ImdSet(imd_);
    }

    function setSinks(address stakingVault_, address arena_, address oracleAdapter_) external onlyOwner {
        stakingVault = stakingVault_;
        arena = arena_;
        oracleAdapter = oracleAdapter_;
        emit SinksSet(stakingVault_, arena_, oracleAdapter_);
    }

    function setExecutor(address to) external onlyOwner {
        executor = to;
        emit ExecutorSet(to);
    }

    function setReserveTarget(uint256 target) external onlyOwner {
        if (target > MAX_RESERVE_TARGET) revert TooHigh();
        reserveTarget = target;
        emit ReserveTargetSet(target);
    }

    function setMaxSpendPerSwap(uint256 maxSpend) external onlyOwner {
        maxSpendPerSwap = maxSpend;
        emit MaxSpendSet(maxSpend);
    }

    /// @notice The Uniswap v4 pool where IMD trades against ETH (ETH must be currency0).
    function setImdPool(uint24 fee, int24 tickSpacing, address hooks) external onlyOwner {
        if (address(imd) == address(0)) revert NotConfigured("imd");
        _imdPoolKey = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(address(imd)),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(hooks)
        });
        imdPoolSet = true;
        emit ImdPoolSet(address(0), address(imd), fee, tickSpacing, hooks);
    }

    function imdPoolKey() external view returns (PoolKey memory) {
        return _imdPoolKey;
    }

    // ------------------------------------------------------------------ allocation (permissionless)

    function allocate() external {
        uint256 amount = unallocated;
        if (amount == 0) return;
        unallocated = 0;
        uint256 toReserve = (amount * RESERVE_CAP_BPS) / BPS;
        uint256 room = reserve < reserveTarget ? reserveTarget - reserve : 0;
        if (toReserve > room) toReserve = room;
        uint256 rest = amount - toReserve;
        uint256 toImd = (rest * IMD_BPS) / BPS;
        uint256 toPrio = (rest * PRIO_BPS) / BPS;
        uint256 toOwner = rest - toImd - toPrio;
        reserve += toReserve;
        imdBudget += toImd;
        prioBudget += toPrio;
        ownerBudget += toOwner;
        emit Allocated(amount, toReserve, toImd, toPrio, toOwner);
    }

    // ------------------------------------------------------------------ withdrawals

    function withdrawOwner(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (amount > ownerBudget) revert ExceedsBudget();
        ownerBudget -= amount;
        _send(to, amount);
        emit OwnerWithdrawn(to, amount);
    }

    /// @notice Gas for the operator wallet, from the fee-funded reserve only.
    function withdrawReserve(address payable to, uint256 amount) external nonReentrant {
        if (msg.sender != owner() && msg.sender != executor) revert NotExecutor();
        if (amount > reserve) revert ExceedsBudget();
        reserve -= amount;
        _send(to, amount);
        emit ReserveWithdrawn(to, amount);
    }

    // ------------------------------------------------------------------ purchases (executor)

    /// @notice Buys PRIO on the hooked pool with `ethIn` from the PRIO budget and splits it 50/50.
    function buyPrio(uint256 ethIn, uint256 minPrioOut) external nonReentrant returns (uint256 out) {
        if (msg.sender != executor) revert NotExecutor();
        if (hook == address(0) || address(prio) == address(0)) revert NotConfigured("prio");
        if (stakingVault == address(0) || arena == address(0)) revert NotConfigured("sinks");
        if (ethIn > maxSpendPerSwap) revert ExceedsMaxSpend();
        if (ethIn == 0 || ethIn > prioBudget) revert ExceedsBudget();
        prioBudget -= ethIn;
        out = _swapEthFor(IFeeHook(hook).poolKey(), ethIn, minPrioOut);
        uint256 toStaking = out / 2;
        uint256 toArena = out - toStaking;
        prio.forceApprove(stakingVault, toStaking);
        IRewardSink(stakingVault).notifyReward(toStaking);
        prio.forceApprove(arena, toArena);
        IPrizeSink(arena).fundPrizes(toArena);
        emit PrioBought(ethIn, out, toStaking, toArena);
    }

    /// @notice Buys IMD for agent work with `ethIn` from the IMD budget and hands it to the OracleAdapter.
    function buyImd(uint256 ethIn, uint256 minImdOut) external nonReentrant returns (uint256 out) {
        if (msg.sender != executor) revert NotExecutor();
        if (!imdPoolSet) revert NotConfigured("imd pool");
        if (oracleAdapter == address(0)) revert NotConfigured("oracle adapter");
        if (ethIn > maxSpendPerSwap) revert ExceedsMaxSpend();
        if (ethIn == 0 || ethIn > imdBudget) revert ExceedsBudget();
        imdBudget -= ethIn;
        out = _swapEthFor(_imdPoolKey, ethIn, minImdOut);
        imd.safeTransfer(oracleAdapter, out);
        emit ImdBought(ethIn, out);
    }

    // ------------------------------------------------------------------ swap plumbing

    function _swapEthFor(PoolKey memory key, uint256 ethIn, uint256 minOut) internal returns (uint256 out) {
        bytes memory result = poolManager.unlock(abi.encode(key, ethIn));
        out = abi.decode(result, (uint256));
        if (out < minOut) revert Slippage();
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (PoolKey memory key, uint256 ethIn) = abi.decode(data, (PoolKey, uint256));
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: true, amountSpecified: -int256(ethIn), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            ""
        );
        uint256 owed = uint256(uint128(-delta.amount0()));
        uint256 out = uint256(uint128(delta.amount1()));
        // The hook's 0.5% is inside `owed`; a bounded spend never exceeds the budget line.
        if (owed > ethIn) revert ExceedsBudget();
        poolManager.settle{value: owed}();
        poolManager.take(key.currency1, address(this), out);
        return abi.encode(out);
    }

    function _send(address payable to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
