# Review record: prior findings, fixes and the self-review

## Prior attempt

Job `bbf45a6b` (explorer) built a first version, ended with "audit_judge exhausted its attempts" and
was blocked before any deployment ("No transactions were broadcast"). Its source repository
(`identity-md-launches/launch-1012-workflow-contract-stage-context`) contains only the empty
workspace commit, so the audit text itself is not retrievable; the brief for this job lists the
findings that must be fixed. Each is addressed below with the test that proves it.

| Finding named in the brief | Fix in this project | Evidence |
| --- | --- | --- |
| Reserve / withdrawal caps missing | `FeeTreasury.allocate` caps the reserve at 10% of each allocation and at a finite `reserveTarget` (≤ 2 ETH); `withdrawOwner` and `withdrawReserve` cannot exceed their budgets | `test_allocationSplitAndReserveCap`, `test_reserveStopsAtTarget`, `test_ownerAndReserveWithdrawalsAreCapped` |
| Old rounds not claimable | Arena state and claims are indexed by round; `claim`/`refund` work for any settled/cancelled round forever | `test_oldRoundStaysClaimableAfterNewRounds` |
| Penalties stacking | One penalty per entry: `payoutOf` returns 100 / 90 / 80 / 102, never less; `MAX_LOSS = 22` | `test_noWinnerReturnsPrizeToPool`, `test_constantsPublished` |
| Fee silently dropped / incompatible deployment | Hook validates its flags in the constructor; initialization refuses any pool but ETH/PRIO from the factory; fee is a constant and the claim path keeps it when ETH cannot move | `test_constructorRefusesMismatchedAddress`, `test_initializeOnFreshHookRefusesWrongPair`, claims suite |
| Owner advances / unfunded operations | `FeeTreasury.receive` accepts ETH from the hook only; `OracleAdapter.request` refuses until configured and funded | `test_onlyHookCanFund_noOwnerAdvances`, `test_paidRequestDisabledUntilConfigured` |
| Unfunded reward accrual | `StakingVault.notifyReward` refuses unless balance − principal covers all owed rewards; accrual stops at `periodFinish` | `test_noRewardsWithoutFunding`, `test_rewardsProRataByStakeAndTime_andStopAtPeriodEnd`, `invariant_vaultCoversPrincipalAndOwedRewards` |
| Oracle evidence missing / replay | Pinned question hash, chain, panel, quorum, `agreed >= quorum`, issued-at boundary, expiry, consumed request ids; evidence stored | `OracleAdapterTest` |
| Ownership renounceable / one-step | `TwoStepOwned`: `Ownable2Step`, `renounceOwnership` reverts | inherited everywhere |

## Self-review against the uniswap-v4-security checklist

| # | Check | Result |
| --- | --- | --- |
| 1 | callbacks verify `msg.sender == poolManager` | `onlyPoolManager` on every implemented callback and `unlockCallback`; protected floor test passes |
| 2 | router allowlisting | not needed: the fee is charged whoever routes; `sender` is not trusted for anything |
| 3 | unbounded loops | none in any callback; Arena settlement is O(1) |
| 4 | reentrancy | hook's only external calls are to the PoolManager and the treasury's `receive()`; treasury, vault, arena use `ReentrancyGuard`; CEI in `flush` |
| 5 | delta accounting | the hook returns exactly the amount it `take`s/`mint`s, in the same currency, so its net delta is zero every path; fuzz `testFuzz_feeChargedMatchesTreasuryIncome` |
| 6 | fee-on-transfer | PRIO is standard; ETH side only |
| 7 | hardcoded addresses | none: PoolManager, token, factory, owner are constructor args; intake, signer and venues are owner-set |
| 8 | slippage | treasury swaps take `minOut`; routers set their own limits (see README "Quote tick limits") |
| 9 | sensitive data | none on chain |
| 10 | upgrade mechanisms | none; no delegatecall, no selfdestruct (floor test) |
| 11 | `beforeSwapReturnDelta` justified | only on ETH-specified swaps, only the specified side, bounded to 0.5% of the leg; never a NoOp |
| 12 | fuzz | quote identity and fee conservation fuzzed |
| 13 | invariants | vault and arena accounting invariants run under a handler |

## Known limitations and open items

- **Independent review before deployment** is required by the brief and is not something this job
  can perform on itself. This document is the hand-off for that reviewer.
- **Mainnet deployment and receipts**: this assignment does not control a funded wallet; the IMD
  launch step deploys from the manifest and records the addresses. No prior deployment exists to
  avoid duplicating (the prior job was blocked before broadcasting).
- **Slither/Mythril** were not available offline; `forge build`'s lints were reviewed (all are
  informational: timestamp comparisons that the design needs, events after the external calls that
  produce them).
- **IMD venue**: where IMD trades against ETH on mainnet was not given; `FeeTreasury.setImdPool`
  is the owner's setting and PRIO purchases do not depend on it.
