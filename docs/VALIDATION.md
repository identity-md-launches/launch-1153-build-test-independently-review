# PRISM RIOT validation — 2026-10-10

These are worker-performed checks, not independent certification. The source and static export continue accepted website commit `230e8aaa2d52802a00427c8746f23ecc0238a9d7`. Publication status is recorded separately in [PUBLICATION.md](PUBLICATION.md); reaching the old site does not prove this update was published.

## Diagnosis and fresh mainnet evidence

The worker loaded https://prio.sites.imd.fun/ in Chromium with a controlled injected provider, connected, disconnected, then emitted `accountsChanged`. The delivered application showed “Wallet connected” while its WalletClient was absent. Staking approval/deposit/revoke controls were disabled without identifying that missing client, yet the panel said “Deposits work”. No signature was requested during reproduction. `docs/before-reproduction.json` preserves the observed text and button states.

At fresh block **26161505**, delivered `readSnapshot(owner)` returned `verified=true`, no verification errors, all Phase A bindings complete and pool liquidity **87069701097260906302299**. Reward reserve/rate were zero; paid-game setup was incomplete. A read-only 0.001 ETH buy quote succeeded. This contradicted a blanket broken-pool/oracle diagnosis. `docs/readiness-snapshot.json` records this dated observation, not a future guarantee.

The corrected mainnet read-only regression at block **26161586** passed **12 checks**: runtime/owners/pool, readiness, recovery reads, fresh buy quote, protected router encoding, actual owner router simulation, event reads and candidate IMD quote. The RPC rejected the old OR-topic event filter; bounded address-only reads plus ABI decoding fixed it and returned 28 real events. No mainnet transaction, approval, signature or deployment was submitted.

Pinned token/hook ABI hashes were independently recomputed and matched the deployment input. Other existing ABI/runtime records remain unchanged; no contracts or Foundry dependencies were modified. The prior accepted-source compilation record is retained as historical provenance, not claimed as a compilation performed in this job.

## Actual checks

| Command | Result |
| --- | --- |
| `npm ci` with existing locked dependencies, then external `/tmp/prio-check/web` working copy | Dependencies available for checks; no dependency directory/cache/archive is delivered. Existing manifests and lockfiles unchanged. |
| `npm run typecheck --prefix /tmp/prio-check/web` | Passed on final source. |
| `npm run build --prefix /tmp/prio-check/web` | Passed; repeats `tsc --noEmit`, then Vite. Final output copied to root `dist/`, replacing obsolete hashed files. Relative asset URLs. Existing warnings about chunk size and a static/dynamic import are informational. |
| `npm test --prefix /tmp/prio-check/web` | **47 passed, 0 failed**. |
| `node /tmp/prio-check/web/scripts/check-chain.mjs` | **12 passed**, read-only mainnet block 26161586. |
| `PRISM_FORK_REPORT="$PWD/artifacts/fork-results.json" /tmp/prio-check/web/node_modules/.bin/tsx /tmp/prio-check/web/scripts/fork-check.ts` | **6 funded lifecycle groups passed**, local Anvil fork only. |
| `PRISM_REVIEW_ROOT="$PWD" node /tmp/prio-check/web/scripts/browser-check.mjs` | **32 passed, 0 failed**, Chromium 154.0.8037.0, fork block **26161704**. **9 signed UI transactions**, all local; zero page/console errors or missing static assets. |
| `python3 web/scripts/check-bundle.py` | `BUNDLE-CHECK.json` records final complete file-byte and archive checks, unchanged protected files, all required art/fonts and relative references. |

The external working copy contains the same source, public files, tests/scripts and unchanged configuration/manifests/lockfile. Production `dist/` was served under `/preview/` for browser validation. Tool output logs are preserved under `artifacts/`; persistent results live in `docs/` because the artifact directory is separately uploaded.

## Regression coverage and signed local execution

The 47 unit regressions cover integer percentage/dust/large/zero balance math, invalid amount syntax, gas buffer rounding and affordability, quote minimum/expiry/router calldata, exact Permit2 allowance bounds, action-specific contract verification, nested wallet errors, account/network guards, receipt replacement/reversion, reveal-secret storage/import/export, independent recovery, Phase A/owner checks, signed operator freshness/budgets, reviewed round inputs and season/prize accounting.

The production-browser runner uses a fresh local Ethereum fork and controlled EIP-6963 providers. It warms read-only code/storage/account caches first; this does not replace any browser verification or mutate contract storage. The final Anvil fixture uses automatic transaction mining, four threads, block-number state reads and bounded upstream timeouts/retries. Earlier interval-mining runs became unresponsive even to `eth_chainId`; the exact Anvil cause was not isolated. The final fixture completed in one run. Public RPC requests are intercepted to the loopback fork with an explicit read/simulation allowlist. Ephemeral keys sign only to that local endpoint. The runner covers:

- Saved Turkish preference removal; English player/owner screens; buying above the fold; responsive layout and asset loading.
- Account access without signing; multiple wallets; disconnect/reconnect; saved restoration; locked wallet; account/chain changes; verified/failed network switching; disconnect during asynchronous simulation.
- Invalid/zero/insufficient balances; editable rounded percentages in all four amount flows; ETH gas reserve/MAX; missing and raced quotes, automatic expiry refresh, rejected wallet request and explicit retry.
- Signed buy; two exact sell approvals including Permit2 and signed sell; exact staking approval, deposit while rewards are zero, own-principal withdrawal and separately funded reward claim. Receipts and on-chain balances/allowances are checked.
- RPC failover/outage/recovery; unrelated game RPC failures; target verification failure; separate game readiness; hidden/collapsed verified-owner controls and completed Phase A skips.
- Keyboard practice/dialog focus, faction selection, opt-in sound, reduced motion, mobile shortcuts, axe scans and computed solid-color contrast.

In the final browser MAX case, a wallet started with **0.005 ETH**, entered **0.004652852742351125 ETH** and retained **0.000142118303563407 ETH** after gas. Separate zero-ETH fixtures blocked sell approval, vault approval and an already-approved deposit before any browser signing request. The funded claim fixture transferred 100 PRIO from a funded test wallet to the existing treasury, approved/notified the existing vault through its funder, advanced local time and claimed an actual positive reward while preserving principal. These fixture transactions are separate from the nine browser-submitted transactions.

The separate full game fork regression uses the existing deployed bytecode and fixture fee income. Actual treasury allocation and PRIO/IMD pool purchases fund Arena/Adapter/staking. Production owner functions pin and create all three modes; nine entries use exact approvals and saved/exported secrets. Reveals, ephemeral signed attestations, settlements and claims pay **200/90/80 PRIO**, with unmet Boss threshold **100/90/80**; double claims revert. An unresolved round cancels after its grace period and three refunds each return **102 PRIO**, clearing escrow/locked prizes. These are local signed executions, not hosted-service calls or completed mainnet games. `fork-results.json` contains the actual evidence.

## Interface review and limitations

The pinned Better Interface workflow and all six domains were applied and reviewed during work. [INTERFACE-REVIEW.md](INTERFACE-REVIEW.md) records coverage, source locations, findings/fixes and bounded measurements. Actual desktop/mobile screenshots were viewed; hero clipping was corrected before the final export. [DESIGN.md](../DESIGN.md) documents the final source.

- Paid games/IMD remain unavailable until real owner configuration, fee-funded budgets/prizes/rounds and a separately hosted verified operator exist. The public operator endpoint stays `null`; no URL, owner, key or production identifier was invented. Correct Phase A bindings remain untouched.
- Reward funding in the browser fixture was an external transfer through the existing reward funder, not player principal. Actual mainnet reward reserve/rate remain the observed zero values until funded.
- Wallet extension/device UX, hardware wallets, physical phones, screen readers, native browser zoom, audio perception, CPU profiling and 10%-speed animation replay were not exercised. Controlled-provider Chromium checks do not certify every wallet.
- Reflow at 320px and 200% text resizing were checked separately. Color measurements cover identified solid surfaces; zero axe findings do not establish full accessibility compliance.
- Full Solidity suite/static analysis and recompilation were not rerun for this frontend change. Existing runtimes were verified and actual fork transactions exercised them.
- Historical activity/season reads depend on provider range/finalization support. They report failures rather than publishing invented partial rankings. Existing older-round lookup and reveal/refund recovery remain available.
- Early browser runs exposed rendering waits and the wrapped disconnect-error message; those failures were repaired and the final run is separately recorded. Tests were not broadcast to mainnet.

Publication was attempted with `imd site publish ./dist --name prio`: exit 1, **503 member_sites_closed**. The public URL still served the old entry module at 11:22:39 UTC. No successful update/CID is claimed; the finished export awaits this project’s platform publisher.

No ignore file, Solidity source, existing dependency/build configuration, protected directory or contract deployment changed. All 24 original artwork assets, four animated/still pairs and three local fonts remain complete in source/export. No dependency registry mirror, unnecessary archive, cache or submodule is delivered.
