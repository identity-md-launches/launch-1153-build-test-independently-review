// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PrismRiotToken} from "../src/PrismRiotToken.sol";
import {StakingVault} from "../src/StakingVault.sol";
import {Arena, IRoundOracle} from "../src/Arena.sol";

/// @dev Drives staking and arena entries at random; the token the two contracts hold must always cover
/// principal, owed rewards, escrow, locked prizes and the game pool.
contract Handler is Test {
    PrismRiotToken token;
    StakingVault vault;
    Arena arena;
    address[] users;
    uint256 public roundId;

    constructor(PrismRiotToken t, StakingVault v, Arena a) {
        token = t;
        vault = v;
        arena = a;
    }

    function seedUsers() external {
        for (uint256 i; i < 4; i++) {
            address u = address(uint160(0x1000 + i));
            users.push(u);
            token.transfer(u, 100_000 ether);
            vm.startPrank(u);
            token.approve(address(vault), type(uint256).max);
            token.approve(address(arena), type(uint256).max);
            vm.stopPrank();
        }
    }

    function stake(uint256 who, uint256 amount) external {
        address u = users[who % users.length];
        amount = bound(amount, 1, token.balanceOf(u));
        vm.prank(u);
        vault.stake(amount);
    }

    function withdraw(uint256 who, uint256 amount) external {
        address u = users[who % users.length];
        uint256 max = vault.staked(u);
        if (max == 0) return;
        amount = bound(amount, 1, max);
        vm.prank(u);
        vault.withdraw(amount);
    }

    function claim(uint256 who) external {
        vm.prank(users[who % users.length]);
        vault.claim();
    }

    function fund(uint256 amount) external {
        amount = bound(amount, 1 ether, 1_000 ether);
        if (token.balanceOf(address(this)) < amount) return;
        token.approve(address(vault), amount);
        vault.notifyReward(amount);
    }

    function enter(uint256 who, bytes32 c) external {
        if (roundId == 0 || c == bytes32(0)) return;
        address u = users[who % users.length];
        if (token.balanceOf(u) < 102 ether) return;
        Arena.Round memory r = arena.rounds(roundId);
        if (block.timestamp >= r.commitDeadline) return;
        if (arena.entries(roundId, u).commitment != bytes32(0)) return;
        vm.prank(u);
        arena.enter(roundId, c);
    }

    function warp(uint256 by) external {
        vm.warp(block.timestamp + bound(by, 1, 2 days));
    }

    function setRound(uint256 id) external {
        roundId = id;
    }
}

contract MockOracle is IRoundOracle {
    uint64 public notBefore;

    function pin(uint64 boundary) external {
        notBefore = boundary;
    }

    function resultOf(uint256) external pure returns (Result memory r) {}

    function pinned(uint256) external view returns (Pinned memory p) {
        p.questionHash = keccak256("question");
        p.notBefore = notBefore;
    }

    function ISSUED_AT_TOLERANCE() external pure returns (uint64) {
        return 5 minutes;
    }
}

contract InvariantsTest is Test {
    PrismRiotToken token;
    StakingVault vault;
    Arena arena;
    Handler handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        token = new PrismRiotToken();
        vault = new StakingVault(address(this), address(token));
        arena = new Arena(address(this), address(token));
        MockOracle oracle = new MockOracle();
        arena.setOracle(IRoundOracle(address(oracle)));
        handler = new Handler(token, vault, arena);
        token.transfer(address(handler), 1_000_000 ether);
        handler.seedUsers();
        vault.setRewardFunder(address(handler));
        token.approve(address(arena), 10_000 ether);
        arena.fundPrizes(10_000 ether);
        oracle.pin(uint64(block.timestamp + 5 days));
        uint256 id = arena.createRound(
            Arena.Mode.VaultRaid,
            4,
            uint64(block.timestamp + 5 days),
            uint64(block.timestamp + 6 days),
            uint64(block.timestamp + 7 days),
            1_000 ether,
            0,
            bytes32(0)
        );
        handler.setRound(id);
        targetContract(address(handler));
        bytes4[] memory sels = new bytes4[](7);
        sels[0] = Handler.stake.selector;
        sels[1] = Handler.withdraw.selector;
        sels[2] = Handler.claim.selector;
        sels[3] = Handler.fund.selector;
        sels[4] = Handler.enter.selector;
        sels[5] = Handler.warp.selector;
        sels[6] = Handler.claim.selector;
        targetSelector(FuzzSelector(address(handler), sels));
    }

    function invariant_vaultCoversPrincipalAndOwedRewards() public view {
        assertGe(token.balanceOf(address(vault)), vault.totalStaked() + vault.rewardsOwed());
    }

    function invariant_arenaBalanceIsFullyAccounted() public view {
        assertEq(
            token.balanceOf(address(arena)), arena.totalEscrowed() + arena.lockedPrizes() + arena.unallocatedPrizePool()
        );
    }
}
