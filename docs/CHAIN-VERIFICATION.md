# PRISM RIOT website: deployed contract verification

This website uses the existing Ethereum mainnet economy. No public transaction or on-chain deployment was made by this website update. Funded transaction tests and ephemeral signatures ran only on a local Anvil fork. The owner still needs to configure and fund the application, and operate a separate server, before paid play can open. Contract deployment is not configuration.

## Source and ABI provenance

The application source was downloaded from the public GitHub archive for accepted commit [`0345ffa67225afed469453250362e74b7f00ff42`](https://github.com/identity-md-launches/launch-1158-complete-missing-application-deployment/tree/0345ffa67225afed469453250362e74b7f00ff42). Its `docs/DEPLOYMENT.md`, README, `script/ConfigPlan.s.sol`, Solidity source and compiled ABIs were read. The repository originally supplied to this worker contains the predecessor Solidity source: the frontend deliberately uses the accepted application's ABIs in `web/src/chain/abi/`, not the predecessor application's ABI.

The accepted configuration plan is preserved as reference data in `docs/reference/ConfigPlan.s.sol`; it is not added to Foundry's executable script directory. The copied `docs/DEPLOYMENT.md` describes the historical pre-application launch plan. This document and [`docs/chain-verification.json`](chain-verification.json) are the current deployment addendum.

`forge build --root /tmp/prism-accepted` compiled 132 files using Solidity 0.8.26 successfully. The original optimizer, EVM and metadata settings were retained. The compiler reported an existing state-mutability warning in `script/Deploy.s.sol`; Forge also reported its existing lint warnings, including deadline timestamp checks and test clock use. No Solidity source, test or protected build configuration was modified.

Canonical ABI hashes use recursively sorted object keys, unchanged array order, compact JSON and Keccak-256. Both pinned hashes match exactly:

| Contract | Canonical ABI Keccak-256 |
| --- | --- |
| PrismRiotToken | `0xf36d2fe28b62f817a4fba0b78bb501b41895eada3982280273c063ad8183f577` |
| TreasuryFeeHook | `0x648426405c5b573f3171227588337b09b11a4bb67c65791dda5b682d51c360d7` |

The pinned predecessor deployment file supplies no expected application ABI hashes. All four application ABIs were instead checked against the accepted commit's freshly compiled artifacts. Their computed hashes are recorded in the machine-readable report.

## Mainnet observations

The full reproducible read-only report is [`docs/chain-verification.json`](chain-verification.json), observed on Ethereum chain 1 at **block 26160822**. Every report read uses that same block. Subsequent frontend integration checks used **block 26160827**. Values below are observations, not promises about later state.

| Contract | Address | Runtime bytes | Accepted compiled runtime |
| --- | --- | ---: | --- |
| PRIO | `0xfd1c234972768c23bb21d655966e0b122dd67a2c` | 1,739 | Match |
| TreasuryFeeHook | `0x65a783cc6725a02ce349dc4d72577994df1760cc` | 9,898 | Match |
| FeeTreasury | `0xb68b1ba47734ba91f3fc37164bb39d408908ff7c` | 10,822 | Match |
| StakingVault | `0x10373c4afc7851b8ab5d94dce7ec1688624cec33` | 3,788 | Match |
| Arena | `0xe31277d4e9fbf9fc35239dc7d2280e97d5c817c1` | 9,276 | Match |
| OracleAdapter | `0x002021b4aeb4125ff25e0353b004f6fdec5f93ed` | 11,648 | Match |

Runtime comparison masks only compiler-listed immutable references; all other bytes must match. The public immutable PRIO and PoolManager bindings were checked separately. The full actual runtime hashes are bundled in `runtime-hashes.json` so the browser subsequently compares exact deployed bytes, including immutables, before enabling writes. Infrastructure code presence and runtime baselines are also recorded for the pinned PoolManager, Universal Router, quoter, StateView, Permit2 and IMD addresses. Infrastructure baselines establish consistency with the observed deployment, not an independent source audit of Uniswap or IMD.

All five ownable contracts returned the verified owner `0x13afb9b5780cd9ae79c61503adb69c57845d8eac`. PRIO has no owner function. The token/hook deployment receipt [`0x545df1…1c6dd7d`](https://etherscan.io/tx/0x545df1adb27c4a2ad6de57dd3d4d28005306f1471c0002381d5518fbc1c6dd7d) succeeded in block **26154170**. The application receipt [`0x6f4d5e…151f4a`](https://etherscan.io/tx/0x6f4d5e54bf0e9faa57a2163f7b484678233a0e0fd4498c198366e453c0151f4a) succeeded in block **26154915**. For all six addresses, historical code reads proved absence in the previous block and presence in the deployment block, and each contract emitted logs in its named deployment receipt. Registry receipt data also carries the accepted source commit. Receipt logs and creation checks are included in the report. PublicNode refused these historical code reads with HTTP 403; the pinned DRPC fallback completed them successfully.

The exact live pool key is `(native ETH, PRIO, 12500, 60, TreasuryFeeHook)`. Encoding that key produces pool ID `0xe5394ebbfa5a16fb3a44c34a41a301092890c1ea5d6747237a6135d314ddd971`, exactly matching the hook's recorded pool ID. PoolManager is `0x000000000004444c5dc75cb358380d2e3de08a90`.

The live LP fee was **1.25%**, the packed directional protocol fee was **0**, and the immutable additional hook fee was **0.5% of the ETH pool leg, rounded upward**. The interface reads the protocol fee freshly rather than assuming it remains zero. The frontend itself adds no fee. ETH gas is separate. For exact-input buys, the gross input contains the hook fee; its full-fill estimate is `ceil(input × 50 / 10050)`. Quotes simulate the actual hook and include all pool and hook effects. Displayed hook amounts are estimates because a partial fill can change the ETH leg.

Fresh reads confirmed **all nine Phase A bindings correct** (also captured in `readiness-snapshot.json`, block 26160686). The completed hook/treasury/PRIO/sinks/funder/Arena/adapter bindings must be preserved. The frontend skips all seven completed Phase A transactions.

The hook held 393544776119406 wei of pending fees. Treasury `totalIncome`, reserve and operating balances were zero. Both executors, treasury IMD, adapter Intake/payment, pool/floors and callback/paid settings were unset or disabled. Arena roundCount and prize pools were zero. Staking had 10,000,000 PRIO principal, but zero rewardReserve, rewardsOwed and rewardRate. Configured spending *limits* are distinct from funded budgets; for example maxSpendPerSwap/spendPerWindow were 1 ETH even though spendable balances were zero. These values are not browser defaults.

The current PRIO pool tick was 887271 with zero in-range liquidity, but a 0.0001 ETH buy quote and exact Universal Router buy still simulated successfully by crossing into liquidity. The tested sell quote reverted; no price is fabricated on failure. Integration checks at block 26160827 read an Intake price of 0.5 IMD and simulated the documented candidate ETH/IMD venue. Pool and protocol data are re-read before owner review; no pool or price floor is automatically configured. Runtime, receipt and full simulation observations are in the JSON report.

## Staking rate scale

The accepted deployed `StakingVault` computes `rewardRate = amount * 1e18 / duration`, where `amount` is already a token wei balance. The internal rate therefore has **36 decimal places** relative to PRIO/second. The old presentation divided before calling an 18-decimal formatter. The new precise formatter converts once with `fmt(rewardRate, 9, 36)`; token balances still use the default 18 decimals. It performs no lossy Number conversion and shows nonzero dust explicitly. A funded local-fork rate of `189025768306811092460045138888888888` renders `0.189025768 PRIO / s`. Merely deleting the extra division while retaining an 18-decimal rate formatter would overstate this deployed contract's rate by 10^18. The accepted source, runtime match, unit test and funded fork support this distinction.

## Transaction behavior

All writes require the connected wallet to remain on Ethereum mainnet with the selected account. The exact caller, calldata and value are simulated, the wallet asks for confirmation, and the application waits for a successful receipt before reporting confirmation. Prepared calldata is never counted as an executed setting. A reverted or rejected operation must not trigger reward effects. Cancellation or replacement with a different transaction is not treated as confirmation of the original action; a gas repricing preserves it.

Phase A prepares the seven accepted transactions in exact order: treasury `bindHook`, `setPrio`, `setSinks`; existing hook `bindTreasury`; vault `setRewardFunder`; Arena `setOracle`; adapter `setArena`. Already-correct steps are skipped. Any conflicting setting stops the write path, including a conflict in a later step. Immediately before the effectively permanent hook binding, the exact treasury runtime, owner and already-mined hook binding are checked. Before the one-shot adapter binding, the exact Arena runtime, owner and PRIO are checked. Each successful receipt is followed by a fresh state check.

Phase B is separate. There are no automatically signed defaults. The owner enters reviewed limits, floors, IMD pool parameters, Intake/payment configuration and a real executor. The helper checks a fresh executable IMD quote before setting the pool and the actual Intake price before setting payment. Executors are assigned only after the reviewed configuration is present. Owner transactions do not start a server, fund staking rewards or create prizes by themselves.

Swaps use the deployed Universal Router's verified five-field `ExactInputSingleParams`. The current Uniswap repository main branch has since added an additional field, so it is not blindly used as the deployed ABI. The deployed structure was read from [its verified source](https://eth.blockscout.com/api/v2/smart-contracts/0x66a9893cc07d91d95644aedd05d03f95e1dba8af). Commands are `V4_SWAP` followed by native-ETH `SWEEP`; v4 actions are exact-input single swap, settle all with an input maximum, and take all with a nonzero output minimum. Unused ETH is returned to the connected account. This follows the [Uniswap router integration](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/swapping), with bounded approvals rather than that guide's example unlimited allowance.

Quotes expire after 60 seconds, accepted slippage is 0.01%–5%, and router execution has a two-minute deadline from the checked block. Selling requires an exact PRIO allowance to Permit2 and a second exact-amount Permit2 allowance to the pinned router, expiring after at most twenty minutes. After approvals, the user obtains a fresh quote. Staking and game approvals are exact amounts. Approvals remain separate confirmed transactions and may remain if a later operation is rejected; the UI supports allowance revocation.

The Arena uses actual **round-indexed** `enter(roundId, commitment)`, `reveal(roundId, choice, salt)`, `claim(roundId)` and `refund(roundId)`, plus permissionless settle/cancel. A commitment is `keccak256(abi.encode(roundId, player, uint8 choice, bytes32 salt))`. Secrets are created with browser cryptographic randomness and saved locally **before** entry approval. Browser recovery files are explicit exports/imports; secrets are not uploaded to the operator endpoint. Imported secrets are checked for chain, Arena, wallet, round, salt and matching commitment. A different existing secret cannot be overwritten. A damaged local storage key that contains another wallet's or round's secret is rejected. The entry helper also rechecks the stored secret against the current account, round and submitted commitment, preventing an account-switch race from committing an unrecoverable choice. Before a reveal is simulated, fresh round deadlines and the matching commitment are checked locally so early, late or incorrect secrets are never disclosed to the public RPC by that path.

Entry locks 102 PRIO: 100 escrow and a 2 PRIO fee. A wrong reveal returns 90 PRIO; missing reveal returns 80 PRIO. Maximum loss is 22 PRIO, excluding gas. Cancellation refunds 102 PRIO; cancellation becomes available after the result deadline plus 72 hours when the contract has no valid result. Withdrawal, reveal, claims and refunds are not hidden behind the new-paid-entry readiness gate. Their write path verifies only the actual recovery target, immutable PRIO and Ethereum wallet, so an unrelated treasury/operator outage or owner change does not block an otherwise valid recovery. A failed optional oracle-evidence read is surfaced separately while round, entry and payout data remain accessible. All remain subject to contract simulation and the real round's state/deadlines. No fixed APY or guaranteed prize is presented.

## Separate operator's public status protocol

Static IPFS hosting does not host the operator. By default, paid entries remain disabled. To demonstrate real server readiness, an operator may publish a **public HTTPS JSON endpoint**, enable CORS for the site, and configure its single URL in `web/public/project.json` before rebuilding. Players never enter a server URL. The current value is `null` because no separately hosted operator endpoint was supplied or verified. Requests omit cookies, credentials and the referring URL. There are no API keys, signed transactions or unrevealed game secrets in this request. The site does not make paid IMD API calls.

The response shape is the exported TypeScript `SignedOperatorStatus` in `web/src/chain/operator.ts`:

```ts
{
  payload: {
    version: 1,
    chainId: 1,
    arena: Address, // exact deployed PRISM RIOT Arena above
    generatedAt: number, // Unix seconds
    expiresAt: number, // greater than generatedAt, at most 300 seconds later
    observedBlock: string, // decimal mainnet block number
    paidOperationsEnabled: boolean,
    budget: {
      requestsRemaining: number,
      gasEthRemainingWei: string,
      imdRemainingWei: string
    },
    activity: Array<{
      id: string,
      kind: 'request' | 'purchase' | 'attestation' | 'heartbeat',
      time: number,
      summary: string,
      transactionHash?: Hex
    }>
  },
  signature: Hex // 65-byte EIP-191 personal-message signature
}
```

Serialize the payload using recursively sorted JSON object keys and unchanged array order, with no whitespace, prefixed exactly by `PRISM RIOT operator status v1\n`. `operatorStatusMessage(payload)` implements this format. The **current configured executor**, which must match on both treasury and adapter, signs that message on the separate server. No signing key belongs in this repository's frontend. Optional `reviewedChallenges` bind reviewed IMD proposal IDs/titles to exact question, body and future-rules hashes; see `OPERATOR.md`. The website recovers the signer, checks the chain and Arena, requires a report no older than five minutes and no more than 30 seconds in the future, requires a live expiration within five minutes of issue, and checks the reported block is no more than 32 blocks behind its fresh chain snapshot.

Valid signature alone does not enable paid entry. Deployment verification, all Phase A bindings, Phase B configuration, available on-chain spend windows, fee-funded budgets, adapter IMD, funded active prizes, the operator's paid switch and its remaining request/gas/IMD budgets must all pass. The exact signed report and a fresh snapshot are rechecked immediately before entry. A particular round must also be open, funded, before its commitment deadline and use the deployed adapter. Operator activity appears only from a verified signed report and remains attributed to that server; receipt/event data is the separate evidence of chain outcomes.

## Round management and seasonal evidence

The owner-only panel uses the compiled `OracleAdapter.pinQuestion` and `Arena.createRound` ABIs. It verifies owner/runtime/Phase A, reviewed Phase B, actual available fee-funded budgets, fresh signed operator service readiness and an unallocated prize at least as large as the draft. A separate service-readiness check allows the *first* round without pretending locked prizes already exist; player entry still requires an actual funded open round. The question's `notBefore` must equal its commit deadline. Correct existing pins are skipped; conflicting pins stop. Each transaction is simulated and receipt/readback checked against the exact immutable fields. `rulesHash` is reproducible from canonical `roundRules()` JSON including scoring, public body, mode, thresholds, deadlines and prize.

UTC calendar-month rankings use finalized Arena `Claimed` events beginning at application deployment block 26154915. Each event is checked against its successful receipt and canonical block, deployed runtime, settled round, claimed entry and exact payout. Scores sum only `max(claimAmount - 100 PRIO, 0)`; refunds and returned principal are excluded. Equal totals sort by address. An interrupted history read returns no partial ranking. This is public-chain verification through the configured RPC, not an independent consensus/light client.

## Commands executed and results

Freshly compiled accepted source and all six deployed runtimes/ABIs matched at block **26160822**. Both deployment receipts succeeded. The 12 read-only integration checks passed at **26160827**; 40 unit tests passed. The production funded path was then exercised on a local fork at **26160788**, including exact approvals, owner pin/create, commitments, reveals, attestation/settlement, payouts, missed reveals and cancellation refunds. No public transaction was broadcast. See `fork-results.json` for fixture limitations and `VALIDATION.md` for actual commands.

The reproducible `verify-chain.mjs` accepts a compiled accepted-source directory; without it, the bundled verified runtime baseline is checked. `check-chain.mjs` reads current configuration without assuming Phase A remains unset. Live values may change after delivery. Runtime consistency and worker tests are not a contract security audit.
