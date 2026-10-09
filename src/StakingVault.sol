// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TwoStepOwned} from "./TwoStepOwned.sol";

/// @title StakingVault: PRIO staking with rewards that exist only once funded
/// @notice `stake()`, `withdraw()`, `claim()`. Rewards are PRIO the treasury (or owner) hands over with
/// `notifyReward(amount)`; each notification streams linearly over `rewardsDuration` (default 30 days),
/// pro rata to stake and time, Synthetix-style. When a period ends, accrual stops until the next funding.
/// There is no APY, no minting and no accrual against tokens the vault does not hold: a notification is
/// refused unless the vault's balance minus all principal covers every reward still owed.
///
/// The stream pauses while nothing is staked: seconds with `totalStaked == 0` do not consume the schedule,
/// `periodFinish` moves forward by exactly that idle time, and the whole funded amount is still paid to
/// whoever stakes later. Nothing funded is ever streamed to nobody.
///
/// Principal is isolated: `totalStaked` is never spent on rewards, games or operations, and `withdraw()`
/// always returns exactly what was staked.
contract StakingVault is TwoStepOwned, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_DURATION = 1 days;
    uint256 public constant MAX_DURATION = 365 days;
    uint256 internal constant PRECISION = 1e18;

    IERC20 public immutable prio;

    address public rewardFunder;
    uint256 public rewardsDuration = 30 days;
    uint256 public periodFinish;
    uint256 public rewardRate; // reward per second, scaled by PRECISION
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    /// @notice Rewards committed to streams and not yet paid out.
    uint256 public rewardsOwed;

    uint256 public totalStaked;
    mapping(address => uint256) public staked;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event RewardNotified(uint256 amount, uint256 rate, uint256 periodFinish);
    event RewardFunderSet(address indexed funder);
    event RewardsDurationSet(uint256 duration);

    error ZeroAmount();
    error InsufficientStake();
    error NotFunder();
    error Underfunded();
    error BadDuration();
    error ZeroAddress();

    constructor(address owner_, address prio_) TwoStepOwned(owner_) {
        if (prio_ == address(0)) revert ZeroAddress();
        prio = IERC20(prio_);
    }

    // ------------------------------------------------------------------ owner

    function setRewardFunder(address funder) external onlyOwner {
        rewardFunder = funder;
        emit RewardFunderSet(funder);
    }

    /// @notice Applies to the next notification; an active stream keeps its schedule.
    function setRewardsDuration(uint256 duration) external onlyOwner {
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert BadDuration();
        rewardsDuration = duration;
        emit RewardsDurationSet(duration);
    }

    // ------------------------------------------------------------------ views

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        uint256 applicable = lastTimeRewardApplicable();
        if (totalStaked == 0 || applicable <= lastUpdateTime) return rewardPerTokenStored;
        return rewardPerTokenStored + ((applicable - lastUpdateTime) * rewardRate) / totalStaked;
    }

    function earned(address account) public view returns (uint256) {
        return (staked[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / PRECISION + rewards[account];
    }

    /// @notice PRIO held beyond principal: what is available to back rewards.
    function rewardReserve() public view returns (uint256) {
        return prio.balanceOf(address(this)) - totalStaked;
    }

    // ------------------------------------------------------------------ users

    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _update(msg.sender);
        totalStaked += amount;
        staked[msg.sender] += amount;
        prio.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) public nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (staked[msg.sender] < amount) revert InsufficientStake();
        _update(msg.sender);
        totalStaked -= amount;
        staked[msg.sender] -= amount;
        prio.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function claim() public nonReentrant {
        _update(msg.sender);
        uint256 reward = rewards[msg.sender];
        if (reward == 0) return;
        rewards[msg.sender] = 0;
        rewardsOwed -= reward;
        prio.safeTransfer(msg.sender, reward);
        emit Claimed(msg.sender, reward);
    }

    function exit() external {
        withdraw(staked[msg.sender]);
        claim();
    }

    // ------------------------------------------------------------------ funding

    /// @notice Pulls `amount` PRIO from the caller (treasury or owner) and streams it over `rewardsDuration`.
    function notifyReward(uint256 amount) external nonReentrant {
        if (msg.sender != rewardFunder && msg.sender != owner()) revert NotFunder();
        if (amount == 0) revert ZeroAmount();
        _update(address(0));
        prio.safeTransferFrom(msg.sender, address(this), amount);
        uint256 leftover = 0;
        if (block.timestamp < periodFinish) {
            leftover = ((periodFinish - block.timestamp) * rewardRate) / PRECISION;
        }
        uint256 total = amount + leftover;
        rewardRate = (total * PRECISION) / rewardsDuration;
        // Only funded rewards are ever promised.
        rewardsOwed = rewardsOwed - leftover + total;
        if (rewardsOwed > rewardReserve()) revert Underfunded();
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardsDuration;
        emit RewardNotified(amount, rewardRate, periodFinish);
    }

    /// @dev With stakers: fold the elapsed stream into the accumulator. Without stakers: the elapsed time is
    /// idle, so the remaining schedule (`periodFinish - lastUpdateTime`) is shifted forward unchanged.
    function _update(address account) internal {
        if (totalStaked == 0) {
            if (periodFinish > lastUpdateTime) {
                // A stream with time left: carry the remaining seconds forward untouched.
                periodFinish += block.timestamp - lastUpdateTime;
                lastUpdateTime = block.timestamp;
            } else {
                lastUpdateTime = lastTimeRewardApplicable();
            }
        } else {
            rewardPerTokenStored = rewardPerToken();
            lastUpdateTime = lastTimeRewardApplicable();
        }
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }
}
