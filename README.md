# PRISM RIOT (PRIO) — Uniswap v4 hook launch on Ethereum

Token **Prism Riot (PRIO)**, launch kind `univ4_hook`, pair ETH/PRIO, chain id 1. This repository is
the contract project and the server operator for the launch. It contains no website.

| Contract (Solidity name) | Role |
| --- | --- |
| `PrismRiotToken` | the platform's standard fixed-supply token: 1,000,000,000 PRIO, 18 decimals, minted once to the deployer (the launch factory), plain transfers, no owner/mint/pause/fee/upgrade |
| `TreasuryFeeHook` | immutable extra 0.5% on the ETH leg of every buy and sell in the ETH/PRIO pool, settled in ETH and sent to `FeeTreasury` |
| `FeeTreasury` | receives fee ETH only; 10%-capped reserve, then 30% IMD / 30% PRIO / 40% owner; bounded swaps; PRIO split 50/50 between staking and games |
| `StakingVault` | `stake()`, `withdraw()`, `claim()`; funded rewards streamed pro rata by stake and time |
| `Arena` | Vault Raid, faction duels, boss challenges; commit-reveal; 100 PRIO escrow + 2 PRIO fee; pull claims by round |
| `OracleAdapter` | verifies IMD EIP-712 panel attestations and stores the result and evidence per round |

Everything is owned by the paying wallet through two-step ownership that cannot be renounced
(`TwoStepOwned`). Active rules, reserved payouts and the 0.5% fee cannot be changed by anyone.

## Status and honesty about deployment

- `forge build`, `forge test` (54 tests: unit, fuzz, invariant, deploy rehearsal) and
  `forge fmt --check` pass with `solc = "0.8.26"`. The IMD protected floor tests for the token and the
  hook were rehearsed locally against the built bytecode and pass (11/11).
- **No contract has been deployed.** This assignment does not control a funded wallet or keys; the
  IMD launch's manifest step deploys from the bytecode and records the addresses and receipts. The
  prior attempt (job `bbf45a6b`) never broadcast a transaction, so there is nothing on chain to
  duplicate. "Verified live addresses" therefore cannot be in this submission; they come from the
  launch step after independent review. See `docs/REVIEW.md` for the review hand-off.
- Independent review is required before release and is not something this job can perform on
  itself; the reviewer's checklist and the finding-to-fix table are in `docs/REVIEW.md`.

## Build and test

```bash
forge build
forge test
forge fmt --check
python3 operator/test_operator.py
```

Dependencies are vendored as ordinary files under `lib/` (forge-std, Uniswap v4-core `src` +
`test/utils/CurrencySettler.sol`, OpenZeppelin Contracts v5.1.0, three solmate files v4-core needs).
No git submodules, no `ffi`, no filesystem permissions, no environment variables in tests.

## Deployment parameters (for the manifest step)

| Contract | Constructor arguments |
| --- | --- |
| `PrismRiotToken` | none |
| `TreasuryFeeHook` | `IPoolManager poolManager` = `$poolManager`, `address token` = `$token`, `address factory` = `$factory`, `address owner` = `$owner` |
| `FeeTreasury` | `IPoolManager poolManager` = `$poolManager`, `address owner` = `$owner` |
| `StakingVault` | `address owner` = `$owner`, `address prio` = `$token` |
| `Arena` | `address owner` = `$owner`, `address prio` = `$token` |
| `OracleAdapter` | `address owner` = `$owner`, `address signer` = the IMD oracle signer on Ethereum, `0x5598aa9146215bc13eb26f2c692ad1461fd32982` (oracle-consumer skill, 2026-10-07); owner-rotatable with `setSigner` |

Hook address flags (mined by the deployer with CREATE2): `beforeInitialize | beforeSwap | afterSwap |
beforeSwapReturnDelta | afterSwapReturnDelta` = `0x20CC` (8396). The constructor calls
`Hooks.validateHookPermissions`, so a hook at an address without exactly these bits refuses to deploy.
No constructor calls another contract or needs an address to have code.

Pool: `currency0` = native ETH (address zero, which always sorts first), `currency1` = PRIO,
`fee` = 12500 (1.25%, the launch policy's tier; the hook accepts any static fee and refuses the
dynamic-fee flag), `tickSpacing` = 60. The deployer opens the pool at the policy's price. The token's
supply split (10% distributor, 87% pool, 3% payer) is the factory's; no contract here is allocated
any of it.

`script/Deploy.s.sol` is a reviewable rehearsal (`deployAll(Config)` mines a salt and deploys all six;
`test/Deploy.t.sol` runs it). Its `run()` deliberately reverts: the launch deploys from the manifest.

## After launch (owner settings)

The paying wallet is the owner of all six contracts. Do these in order; each is an owner-only setter
that emits an event, and every function that needs a value reverts with a clear error until it is set.

| Step | Call | Value |
| --- | --- | --- |
| 1 | `TreasuryFeeHook.bindTreasury(treasury)` | the launched `FeeTreasury` (one-time; fees charged before binding wait in the hook and are flushed by anyone with `flush()` / `redeemClaims()`) |
| 2 | `FeeTreasury.bindHook(hook)` / `setPrio(token)` | the launched hook and token (one-time each) |
| 3 | `StakingVault.setRewardFunder(treasury)` | the treasury, so `buyPrio` can stream rewards |
| 4 | `Arena.setOracle(adapter)` | the launched `OracleAdapter` |
| 5 | `FeeTreasury.setSinks(vault, arena, adapter)` | the three launched contracts |
| 6 | `FeeTreasury.setExecutor(wallet)` / `OracleAdapter.setExecutor(wallet)` | the server operator's wallet |
| 7 | `FeeTreasury.setReserveTarget(x)` | default 0.5 ETH, hard cap 2 ETH; `setMaxSpendPerSwap` default 1 ETH |
| 8 | `FeeTreasury.setImd(0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7)` then `setImdPool(fee, tickSpacing, hooks)` | IMD on Ethereum (oracle-consumer skill) and the Uniswap v4 pool key where IMD trades against ETH (the owner finds it on the IMD explorer; ETH must be `currency0`). Without it IMD purchases wait; PRIO purchases do not depend on it |
| 9 | `OracleAdapter.setIntake(0x1397434cd35e8a9c8ac312a61d3a285eb31dea56)`, `setAction(bytes32("oracle.request@oracle-1"))`, `setPayment(IMD, 500000000000000000)`, `setCallbackConfigured(true)`, `setBudget(imdPerDay)` | the live Intake, action id, 0.5 IMD list price (read `Intake.priceOf`), the explicit callback switch, the executor's daily IMD budget |
| 10 | per round: `OracleAdapter.pinQuestion(roundId, questionHash, chainId, minPanel, minQuorum, commitDeadline, body)` then `Arena.createRound(...)` | the question's canonical hash and compact body (oracle-consumer skill "The body"), chain the question is about, minimum panel/quorum, and the round's commit deadline as the clock boundary |

## The hook

Configuration record (OpenZeppelin Wizard shape, implemented by hand on v4-core interfaces):

```json
{"hook":"BaseHook","name":"TreasuryFeeHook","pausable":false,"currencySettler":false,"safeCast":false,
 "transientStorage":false,"shares":{"options":false},
 "permissions":{"beforeInitialize":true,"afterInitialize":false,"beforeAddLiquidity":false,
 "beforeRemoveLiquidity":false,"afterAddLiquidity":false,"afterRemoveLiquidity":false,"beforeSwap":true,
 "afterSwap":true,"beforeDonate":false,"afterDonate":false,"beforeSwapReturnDelta":true,
 "afterSwapReturnDelta":true,"afterAddLiquidityReturnDelta":false,"afterRemoveLiquidityReturnDelta":false},
 "access":"ownable","info":{"license":"MIT"}}
```

**Fee definition.** `FEE_BPS = 50` (0.5%), a constant with no setter. The base is the *ETH leg*: the
ETH amount the pool itself exchanges in the swap, before the hook's fee is added, so the hook fee
never compounds with itself nor with the pool's 1.25% LP fee or the protocol fee, which the
PoolManager accounts separately. Rounded up to the next wei. Per swap shape:

| Swap | Where | Fee | Swapper's view |
| --- | --- | --- | --- |
| buy, exact ETH in `G` | `beforeSwap` | `ceil(G·50/10050)`; pool swaps `G − fee` | pays exactly `G` |
| buy, exact PRIO out | `afterSwap` | `ceil(P·50/10000)` on the pool's ETH charge `P` | pays `P + fee` |
| sell, exact PRIO in | `afterSwap` | `ceil(P·50/10000)` on the pool's ETH payout `P` | receives `P − fee` |
| sell, exact ETH out `E` | `beforeSwap` | `ceil(E·50/9950)`; pool pays `E + fee` | receives exactly `E` |

Views for quoting: `feeOnLeg`, `quoteBuyExactInput`, `quoteSellExactOutput`. A 1-wei buy cannot
execute (the whole wei is fee and the pool refuses a zero swap); every larger amount works.

**Settlement in ETH.** The fee is always ETH, taken inside the swap that paid it. When the PoolManager
holds at least the fee in ETH, the hook `take`s it to itself and forwards it to the bound treasury in
the same transaction. When it does not (the launch pool is seeded with PRIO only, so the first buys
see no ETH in the manager), the hook mints itself an ERC-6909 ETH claim; anyone may later call
`redeemClaims(amount)`, which unlocks the manager, burns the claim and forwards ETH to the treasury.
Both paths are tested (`TreasuryFeeHookTest`, `TreasuryFeeHookClaimsTest`). If the treasury ever
refused ETH the hook keeps the ETH in `pendingEth` and `flush()` retries later; a swap is never
reverted because of fee delivery, and the fee is never dropped. `FeeTreasury.receive` only accepts
ETH from the hook.

**Pool binding.** `beforeInitialize` accepts one pool only, from the factory: ETH as `currency0`,
PRIO (the `$token` constructor argument) as `currency1`, this hook, any static LP fee. The
`PoolKey` is recorded; swaps on any other key revert, and a second initialization reverts.
Ordinary PRIO transfers and other pools carry no fee.

**Quote tick limits.** The hook does not alter `sqrtPriceLimitX96` and does not override the LP fee.
Routers quote with the hook (the v4 Quoter simulates hook deltas) and set their own price limit; the
ETH leg used for the fee is whatever the pool exchanged within that limit, so a partially filled
swap pays 0.5% of the partial leg. The treasury's own buys use the full range limit and a `minOut`.

**Compatibility.** Tested against v4-core's `PoolManager`, `PoolSwapTest` and
`PoolModifyLiquidityTest` routers (the production manager and its reference routers), with the pool
opened by a factory address through `PoolManager.initialize`, and against the IMD protected floor
tests (mined flags, callback refusal, initialization from the factory probe, no escape hatches).

## FeeTreasury

- Income: ETH from the hook only (`totalIncome`). No owner advance is possible; without income nothing
  is paid.
- `allocate()` (anyone): reserve takes `min(10% of the allocation, reserveTarget − reserve)`, then the
  rest goes 30% `imdBudget`, 30% `prioBudget`, 40% `ownerBudget`. Reserve target default 0.5 ETH, hard
  cap `MAX_RESERVE_TARGET = 2 ETH`: a finite, documented reserve.
- `withdrawReserve` (owner or executor) pays the operator wallet's gas from the reserve only: the
  fee-funded gas bootstrap. `withdrawOwner` is capped by `ownerBudget`.
- `buyPrio(ethIn, minOut)` (executor): bounded by `prioBudget` and `maxSpendPerSwap`, swaps ETH→PRIO on
  the hooked pool through the PoolManager (paying the 0.5% back to itself), checks `minOut`, then sends
  half to `StakingVault.notifyReward` and half to `Arena.fundPrizes`. Works with no IMD configuration.
- `buyImd(ethIn, minOut)` (executor): same bounds on `imdBudget`, on the owner-set IMD pool, output to
  the `OracleAdapter`.
- Swaps are executor-gated because a permissionless swap with a caller-chosen `minOut` would be a
  sandwich target; allocation, flushing and claims are permissionless.

## StakingVault

Synthetix-style streaming: `notifyReward(amount)` (treasury or owner) pulls PRIO and streams it
linearly over `rewardsDuration` (default 30 days, owner-settable 1–365 days for *future*
notifications; an active stream keeps its schedule, and leftover rolls into the next). Rewards accrue
pro rata to `staked[user] × time`. When `periodFinish` passes accrual stops until the next funding.
A notification is refused unless `balance − totalStaked ≥ rewardsOwed`, so no unfunded accrual, no
APY, no minting. Principal is isolated: `totalStaked` is never spent, `withdraw` returns exactly the
stake, and the invariant test checks `balance ≥ totalStaked + rewardsOwed` under random actions.

## Arena

Published, fixed scoring for every mode (constants in the contract):

| Outcome | Returned per entry | Loss |
| --- | --- | --- |
| correct choice | 100 PRIO + equal share of the round's prize | 2 (fee) |
| wrong choice | 90 PRIO | 12 |
| missed reveal | 80 PRIO | 22 (`MAX_LOSS`) |
| cancelled round | 102 PRIO | 0 |

Penalties never stack. Entry pulls exactly 102 PRIO from the player's approval and never more; the
Arena never touches staking principal (a separate contract).

- **Modes.** Vault Raid: `choiceCount` vaults, pick the one the panel finds. Faction duel: two
  factions. Boss challenge: cooperative; the prize is paid only if at least `bossThreshold` players
  chose correctly, otherwise correct players keep 100 PRIO and the prize returns to the game pool.
- **Winning choice** = `(oracle answer mod choiceCount) + 1`, from the `OracleAdapter` result for the
  round's pinned question. No result, no settlement.
- **Frozen before entry.** `createRound` locks the prize from the funded game pool and fixes mode,
  choices, deadlines, threshold and `rulesHash` (hash of the published rules text). There is no edit.
- **Commit-reveal.** `enter(roundId, keccak256(abi.encode(roundId, player, choice, salt)))` before
  `commitDeadline`; `reveal(roundId, choice, salt)` between `commitDeadline` and `revealDeadline`.
  Players must back up their salt; a lost salt is a missed reveal (80 back).
- **Settlement** (`settle`, anyone, after `revealDeadline`) is O(1): tallies are counted at reveal.
  The result's `issuedAt + 5 minutes` must be ≥ `commitDeadline`, the same tolerance the adapter uses.
- **Cancellation** (`cancel`, anyone) when no valid result exists 72 hours after `resultDeadline`:
  prize back to the pool, every entry refundable at 102 PRIO.
- **Pull claims by round:** `claim(roundId)` / `refund(roundId)`; old rounds stay claimable forever.
- **Game-pool allocations.** Entry fees, penalties and prize dust go to `unallocatedPrizePool`, which
  funds future prizes together with the treasury's PRIO purchases. Prizes of rounds with no correct
  player (or a failed boss) return to it.
- **Ties.** Every correct player receives the same share (`prize / correct`); there is no ranking, so
  no tie-break is needed.
- **Multi-wallet risk.** Nothing on chain stops one person entering from several wallets to cover
  more choices; the owner should size prizes so that covering all choices (`choiceCount × 12 PRIO`
  loss) is not profitable, and the boss threshold adds a group requirement. No guaranteed profit
  exists for anyone.

## OracleAdapter

Inherits the protocol's `OracleAttestationConsumer` (copied from the oracle-consumer skill; the
conformance vector test passes). Per round the owner pins the question hash, the chain the question
is about, minimum panel and quorum, the body and `notBefore` (the commit deadline). An attestation is
accepted only if it is signed by the trusted signer in **this contract's** EIP-712 domain, not expired,
`issuedAt ≤ now + 5 min`, `issuedAt + 5 min ≥ notBefore` (clock tolerance consistent with the Arena's
settle check), question hash and chain match, `panelSize ≥ minPanel`, `quorum ≥ minQuorum`,
`agreed ≥ quorum`, the answer is a `uint256`, and `requestId` was not consumed. The stored `Result`
carries the answer and the evidence reference (request id, panel job id, block window and hash).

Two paths in: the Intake's callback `onOracleResult` (only from the configured intake, only for a
request this contract made, under the 200 000 gas stipend, tested) and the permissionless manual
relay `submitAttestation`. Paid requests (`request(roundId)`, executor only) are disabled until
intake, action, asset+price, callback switch, executor and budget are set and the contract holds IMD;
`clearStale` forgets a request after 2 days (a refused or non-agreeing panel never calls back and the
price is spent).

## Server operator

See `docs/OPERATOR.md`. `operator/operator.py` (stdlib only) does capabilities / check / quote /
payment / polling / retries / result relay / proposals, with daily IMD, gas and request caps and a
`paid_operations_enabled` switch that stays off until configuration and fee funding are done. Keys
stay server-side. Agent outputs are proposals only.

## What the brief asked that the token does not do

Nothing extra was asked of the token itself; the fee lives in the hook as the launch requires. The
launch also fixes the supply split, so no contract here receives tokens at launch; the vault, arena and
treasury hold only what users and purchases put in afterwards.

## Assumptions

- "0.5% on the ETH leg, excluding fees" is read as 0.5% of the ETH amount exchanged with the pool,
  charged on top of (not inside) the LP and protocol fees.
- The IMD trading venue for `buyImd` is a Uniswap v4 ETH/IMD pool the owner names; if IMD trades
  elsewhere, the IMD budget simply accumulates until a venue is configured.
- The HTTP door paths in `operator.example.json` are configurable; the on-chain Intake flow is the
  authoritative one and is what the contracts test.

## Layout

```
src/            contracts            test/      Foundry tests (+ utils/Fixture.sol, utils/MockIntake.sol)
script/         Deploy.s.sol         docs/abi/  ABIs        docs/OPERATOR.md  docs/REVIEW.md
operator/       operator.py, test_operator.py, operator.example.json
lib/            vendored dependencies
```
