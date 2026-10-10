# PRISM RIOT operator

The operator is `operator/operator.py`, a Python 3.10+ script with no third-party dependencies. It
drives the two IMD paid flows the project uses and relays results to the contracts. It holds no
authority: it can only spend what the owner budgeted on chain (`OracleAdapter.setBudget`) and what
`operator.json` allows, and nothing it produces can change an active round or move player funds.

## Website handoff for this update

The website remains a static export, not a running operator. Current `web/public/project.json` is `{"version":1,"operatorStatusUrl":null}`. No server endpoint has been supplied or verified. Do not use a made-up URL, browser key or paid IMD credential to make readiness look active.

When the separately hosted service is available, the project maintainer sets its **single public HTTPS JSON status endpoint** in that file and rebuilds/publishes `dist/` under the existing `prio` name. Ordinary players are never asked for an endpoint. Serve CORS for the public site/gateway origins; the browser sends no credentials or referrer. Keep responses at most 64 KiB, with bounded activity. A static JSON file pinned to IPFS cannot supply ongoing fresh heartbeats.

Implement the exact `SignedOperatorStatus` / `operatorStatusMessage` schema in `web/src/chain/operator.ts`: recursively sorted object keys, unchanged array order, compact JSON, prefixed by `PRISM RIOT operator status v1\n`, signed as an EIP-191 message by the **current executor on both Treasury and Adapter**. Reports bind chain 1, the existing Arena and a block no more than 32 blocks behind the fresh snapshot. Issue at most five minutes ago, at most 30 seconds into the future; expire within five minutes. Include the real paid switch, remaining request/gas/IMD budgets and only actual activity. The browser rejects wrong signer/chain/Arena, stale/expired reports, malformed content and insufficient budgets; it automatically clears expired proof. Availability/status is an executor assertion; chain receipts remain the evidence of payments.

For reviewed IMD challenges, the optional signed `reviewedChallenges` array contains `id`, `title`, `questionHash`, `bodyHash`, `rulesHash`, `reviewedAt` (Unix seconds). At most 20 proposals; hashes are bytes32. The real operator must review the actual content and exact Intake JSON body, obtain the protocol's canonical question hash from its check/quote process, and agree the future-round parameters with the owner. `bodyHash` is Keccak-256 of exact UTF-8 body bytes; `rulesHash` is the website's reproducible `roundRules()` document hash. They are not interchangeable. The owner explicitly reviews and approves the published question, choices/scoring, deadlines and real prize budget in Round management before pin/create. A matching signed proposal is mandatory when source is IMD. This does not grant an operator the power to change existing rounds, issue tokens or create new reward rights.

Fresh chain checks still show Phase B, operating funding and rounds incomplete despite all nine correct Phase A bindings. Finish owner-reviewed configuration, callback/relay verification, matched executors and funded on-chain budgets before reporting paid operations ready. Preserve fee-funded spending caps and the existing server ledger. If fee income is insufficient, keep free-practice-only operation. The browser's first-round service guard requires operating readiness and available prizes but does not require a pre-existing locked round; paid player entry additionally checks the actual open funded round.

The server code below predates this website update; deploying/operating it and exposing the signed status endpoint remain a separate handoff. No server is started by loading the site. Do not copy the fork test's ephemeral signer or fixture settings to mainnet.

## Setup

1. Copy `operator/operator.example.json` to `operator.json` and fill `contracts.*` with the launched
   addresses (README "Deployment").
2. Export the operator wallet's key **on the server only**: `export OPERATOR_PRIVATE_KEY=0x...`.
   The key is passed to `cast send` as a subprocess argument and never written to disk or logs.
   Fund the wallet's gas from the treasury's reserve (`FeeTreasury.withdrawReserve`, owner or executor)
   after fees have accrued; there is no other gas source.
3. Set the same wallet as executor on chain: `FeeTreasury.setExecutor` and `OracleAdapter.setExecutor`.
   What that wallet can do is bounded on chain whatever happens to the key: `FeeTreasury` allows at most
   `maxSpendPerSwap` per purchase and `spendPerWindow` per rolling day, never below the owner's price
   floors (`setPriceFloors`); `OracleAdapter` allows `budgetPerWindow` IMD per day. The owner should keep
   the price floors a little below the market price and re-set them when PRIO or IMD move a lot: a floor
   above the market makes purchases revert (safe), never overpay.
4. Leave `paid_operations_enabled` at `false` until the owner has done the "After launch" steps in
   the README and `OracleAdapter.paidRequestsEnabled()` returns true, and the adapter holds IMD that
   the treasury bought (`FeeTreasury.buyImd`). Then flip it to `true`.

## Commands

| Command | What it does | Paid? |
| --- | --- | --- |
| `capabilities` | GET the door's capabilities | no |
| `quote <action> <body-json>` | `check` then `quote` an action body | no |
| `request-round <roundId> [--dry-run]` | `OracleAdapter.request(roundId)`: pays 0.5 IMD from the adapter's balance via the Intake. Refused (locally and by the adapter) before the round's commit deadline, so an answer never exists while entries are open | yes |
| `poll <requestId>` | polls the request status with the configured interval and attempt cap | no |
| `relay <roundId> <attestation.json> [--dry-run]` | manual result delivery: `OracleAdapter.submitAttestation` | gas only |
| `propose "<brief>" [--dry-run]` | `job.open` for challenge text / artwork; stores the proposal under `proposals/` | yes |

Every paid command passes the daily ledger (`operator-state.json`): IMD per day, gas per day and
request count per day. A refused step prints the reason and exits 1. Retries use linear backoff and
a fixed attempt cap; polling stops on the first terminal status.

## Result delivery and claims

The Intake calls `OracleAdapter.onOracleResult` itself when the panel settles (status 0). If that
callback is missed (out of gas, status 1/2, or a relayer outage) the same signed attestation can be
submitted by anyone with `relay`; the signature is the proof, so relaying it is safe. After the
result is stored, `Arena.settle(roundId)` is permissionless, and so are `claim`, `refund` and
`cancel`. Players can always claim themselves; the operator may call these for convenience.

## What agent output is

`propose` returns text and image references. They are **proposals** for the owner to read and, if
accepted, to turn into a *future* round: first `OracleAdapter.pinQuestion(roundCount + 1, ...)` with
`notBefore` equal to the round's commit deadline, then `Arena.createRound(...)`, which refuses a round
whose question is not pinned at that boundary. An active round's rules, deadlines, prize, scoring,
oracle and question are frozen at creation and no contract call can change them.
