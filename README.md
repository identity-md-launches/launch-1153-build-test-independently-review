# PRISM RIOT

English-only Ethereum arcade, PRIO swap and staking interface. Continues accepted website commit `230e8aaa2d52802a00427c8746f23ecc0238a9d7` in this repository. The existing project URL remains **https://prio.sites.imd.fun/** (`prio.site.identitymd.eth`). See [publication status](docs/PUBLICATION.md); a reachable previous version is not evidence that this export has been published.

The token, ownership, fixed supply, original ETH/PRIO pool, allocations and immutable **0.5% treasury hook fee** are unchanged. No contract was deployed, replaced or re-minted. [Deployment/source provenance](docs/CHAIN-VERIFICATION.md), [official X](https://x.com/PrismRiotIMD).

## Install, preview and rebuild

Node.js 22.16+ and npm, using the existing committed manifest and lockfile:

```sh
npm ci --prefix web
npm run dev --prefix web
npm run typecheck --prefix web
npm test --prefix web
npm run build --prefix web
npm run preview --prefix web
```

The build includes TypeScript checking and replaces root `dist/`. Vite's existing `base: './'` produces relative assets. Section links and native dialogs need no server route rewrites. Serve the **contents of `dist/`**, including `project.json`, fonts and artwork. Static hosting does not rebuild the project or run the operator. Never include keys, dependency directories or caches in the export/submission.

For a restricted checkout, copy `web/` to an external working directory, install there, build there, then copy that build's root `dist/` back. This worker used `/tmp/prio-check/web` for final builds/checks. Existing manifests, lockfiles, Foundry configuration, `lib/` and ignore files are unchanged. No dependency directory or registry archive is delivered.

## Financial interactions

**Buy PRIO** is in desktop/mobile navigation, the hero and the first financial card. The card sits beside the hero at widths ≥1200px and immediately after it below that breakpoint. It starts on Buy with an empty amount.

Wallet connection requests account access only. EIP-6963 discovery and legacy injected providers are supported, with explicit provider choice when multiple wallets exist. Restoring a permitted connection reconstructs the account, client and chain together. Disconnect, locked accounts, account/network changes and delayed responses cannot revive an old session or sign through an obsolete client. Network switching is checked against the actual wallet chain.

Swap input triggers a 450ms-debounced simulation. Responses are bound to direction, amount, slippage and wallet session. Quotes expire after 60 seconds, refresh automatically, and have manual retry. The card shows balance, expected/minimum output, slippage, estimated price impact, pool/platform/hook fees and separate buffered gas. Every trade re-verifies the exact pool/router, simulates the actual caller and calldata, checks gas and wallet identity again, and requires wallet confirmation. The router deadline is bounded by the quote expiry. Delaying confirmation past that deadline can revert and still cost gas.

Selling uses an exact PRIO allowance to Permit2 plus an exact router allowance lasting at most 20 minutes. Changing amounts invalidates approval assumptions; actual allowances are reread. No unlimited approval is requested. Missing quotes and approvals lead to named preparation steps rather than unexplained disabled controls.

Staking follows **amount → exact approval if needed → deposit**. Withdrawal and reward claim remain separately accessible. The interface reads principal, claimable rewards, reserve and stream status. Zero rewards display **“No reward stream is currently active”** before confirmation and do not block an otherwise valid deposit. There is no promised APY or yield. `rewardRate` is formatted at the accepted deployed vault's 36-decimal precision; PRIO balances use 18 decimals.

All four amount flows have **25%, 50%, 75%, MAX** shortcuts. Calculations use integer base units and round down. Withdrawal uses that wallet's actual staked principal; staking/selling use its available PRIO. ETH shortcuts deduct a fresh router gas reserve: **25% gas-limit buffer and 20% fee buffer**. Selection only fills an editable field, never signs. Missing balances, estimates, approvals, wallet/client, network, valid input, verified reads or quotes are explained beside the action. Gas affordability is rechecked for every transaction, including approvals, deposits, sales, withdrawals and claims. Receipts refresh balances and allowances.

Financial reads are scoped: staking verifies PRIO/vault, swapping verifies PRIO/hook/pool/PoolManager/router/quoter/StateView/Permit2. Unrelated game/IMD/oracle/operator errors do not block valid financial actions. Both pinned RPCs have bounded failover and visible retry; failed or stale reads are never treated as current zero balances.

## Games and founder controls

The original artwork, logo, four faction reactions, animations, opt-in sound, mobile controls and reduced-motion stills remain. Practice is free, random, wallet-free and awards no tokens. Local practice progress/badges are separate from event-verified paid rankings.

Real games require **100 PRIO escrow + 2 PRIO fee**, with maximum **22 PRIO loss plus gas**. The winning choice is `(oracle answer % choice count) + 1`. Correct reveals return principal plus a funded prize share, wrong reveals return 90 PRIO, and missed reveals return 80. Boss prizes additionally require the locked threshold. Eligible cancelled rounds refund 102 PRIO after the result deadline and 3-day grace period. Cards show actual prizes and deadlines or explain missing data. Reveal-secret backup/import, indexed claims/refunds and older-round lookup remain available.

Paid entry and IMD operations remain disabled until configuration, verified operator status, fee-funded budgets, prizes and rounds are ready. Principal is never an operating budget. No owner operating advance is required. Server keys and paid API calls stay on the separate operator server. `web/public/project.json` retains the owner-settable public HTTPS status endpoint (`null` until supplied); players are never asked to paste an operator URL. [Operator handoff](docs/OPERATOR.md).

Only the connected verified owner sees the collapsed **Founder / Admin** section near the footer. It retains Phase A/B and round management. Correct bindings are skipped, conflicts stop execution, and transaction-level owner checks remain authoritative. The upper navigation and hero contain no founder actions.

## Reproduce validation

```sh
npm test --prefix web
node web/scripts/check-chain.mjs
# Chromium plus anvil must be installed outside the submission:
npm run test:browser --prefix web
web/node_modules/.bin/tsx web/scripts/fork-check.ts
python3 web/scripts/check-bundle.py
```

The browser runner owns a bounded local preview under `/preview/`, its Chromium instance and a fresh Anvil fork. It warms read-only fork caches, uses automatic transaction mining and bounded upstream retries, then tests the production export without replacing its verification. It closes them afterward. It intercepts all public browser RPC traffic to the loopback fork and permits only reads/simulation on that path. Ephemeral fixture keys sign browser transactions exclusively to local Anvil. `PRISM_FORK_RPC`, `PRISM_ANVIL`, `PRISM_REVIEW_CHROMIUM` and optional `PRISM_REVIEW_ROOT` configure tools/checkout locations without modifying production network configuration.

[Actual results, reproduction and limitations](docs/VALIDATION.md), [six-domain Better Interface review](docs/INTERFACE-REVIEW.md), and [implemented design system](DESIGN.md). Final worker results: **47 unit tests, 32 browser checks, 12 read-only chain checks and 6 game-fork lifecycle groups passed**. These are worker checks, not independent certification. Mainnet simulations are explicitly separate from signed local-fork transactions and remaining owner/server setup.

## Publish the same project

After validation, publish the finished export under the existing name:

```sh
imd site publish ./dist --name prio
imd site status <site-id-returned-by-successful-publication>
```

A project-owned name may require the IdentityMD job publisher rather than the member-site CLI. Deliver the complete source, unchanged frontend lockfile and `dist/` through this same project's Git submission. The platform should update `prio.site.identitymd.eth`, preserving https://prio.sites.imd.fun/. Do not create an alternate project name or deploy contracts. Record a successful receipt/CID and compare the public HTML's entry module and assets with `dist/` before claiming publication. [Actual publication result](docs/PUBLICATION.md).
