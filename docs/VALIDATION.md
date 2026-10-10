# PRISM RIOT validation — 2026-10-10

Worker-performed checks, not independent network certification. Website implementation and local verification are complete for the requested scope; public update and GitHub acceptance remain **incomplete pending platform delivery**. The official publisher refused the existing `prio` name with HTTP 503 `member_sites_closed`; the reachable public URL still serves the previous entry module. See [PUBLICATION.md](PUBLICATION.md).

## Scope and fresh state

Reviewed the Turkish-first/English lobby, distinct practice/live game actions, real scoring/costs, faction reactions, staking, readiness, owner Phase A/B and pin/create management, recovery, seasons/badges/challenges and signed operator status. Existing contracts, logo, art, X, budgets and locked rules are preserved. No Solidity, existing build configuration, manifests/lockfiles, dependencies, ignore files, `.git/`, `.github/` or environment files were changed. ABI JSON whitespace was compacted without changing semantic content or canonical hashes.

Mainnet runtime/source/ABI verification at block **26160822** passed for all six deployed contracts; both deployment receipts succeeded. Fresh browser reads reconfirmed all nine Phase A bindings. Phase B, operating balances, adapter IMD, staking rewards, rounds and prizes remained incomplete/zero. Missing settings are not reported as RPC or frontend errors. Chain/readiness JSON records are dated; they are not future guarantees.

Final export: `assets/index-B8OTgtTI.js`, `assets/index-DCGITOhP.css`, lazy financial panels, `project.json` and all original required media. No operator endpoint was available; its documented project setting remains `null`.

## Actual commands and results

| Executed check | Result |
| --- | --- |
| Read pinned project/deployment/network, Better Interface workflow/core six domains/documentation reference; read accepted source and deployment guide | Completed before implementation/review |
| `npm ci --prefix /tmp/prism-riot-build/web --cache /tmp/prism-riot-npm-cache --no-audit --no-fund` | Passed, 94 locked packages; no dependency folder in repository |
| `npm run typecheck --prefix /tmp/prism-riot-build/web` | Passed; final build repeats `tsc --noEmit` |
| `npm run build --prefix /tmp/prism-riot-build/web` | Passed after final practice readability fix; 2,673 modules, relative static export copied to root `dist/` |
| `npm test --prefix /tmp/prism-riot-build/web` | **40 passed, 0 failed** on final source |
| `forge build --root /tmp/prism-accepted` | Passed; accepted commit 0345ffa…, 132 Solidity files, 0.8.26; existing compiler/lint warnings only |
| `node /tmp/prism-riot-build/web/scripts/verify-chain.mjs /tmp/prism-accepted` | Passed, block **26160822**; freshly compiled ABI/runtime/owners/receipts/PoolKey checks |
| `node /tmp/prism-riot-build/web/scripts/check-chain.mjs` | **12 passed**, read-only block **26160827**; actual buy quote/router simulation, sell failure handling, protocol price/candidate IMD quote and recovery/configuration checks |
| `PRISM_FORK_REPORT="$PWD/artifacts/fork-results.json" /tmp/prism-riot-build/web/node_modules/.bin/tsx /tmp/prism-riot-build/web/scripts/fork-check.ts` | **Six funded lifecycle groups passed**, fork block **26160788**, loopback Anvil only |
| `PRISM_REVIEW_DEPENDENCIES=/tmp/prism-riot-build/web PRISM_REVIEW_CHROMIUM=/home/imd2/.cache/ms-playwright/chromium-1246/chrome-linux64/chrome node web/scripts/browser-check.mjs` | **29 passed, 0 failed** against final production export at `/preview/` |
| `imd site publish ./dist --name prio` | Exit 1: **503 member_sites_closed**; 2,152,735-byte local export bundle; publication refused |
| Public URL fetch | HTTP 200; old entry module, so new export publication is **not** claimed |
| `python3 web/scripts/check-bundle.py` | Final results in `BUNDLE-CHECK.json`: protected paths/ABIs/assets/relative URLs/dependency cleanup and byte cap |

The isolated build copied `web/src`, `public`, tests/scripts and unchanged frontend configuration/manifest/lockfile into `/tmp/prism-riot-build/web`. The final export copy replaced obsolete hashed files. This arrangement respects the task's prohibition on touching repository `node_modules` or existing dependency configuration. Ordinary future development commands are in README.

## Useful interaction coverage

The 40 unit tests cover exact/bounded approvals and router calldata, slippage/quote expiry, wallet account/network races, failed/replaced receipts, private reveal storage/export/import, early/late/mismatched reveal protection, independent recovery, Phase A order/conflict/owner checks, signed operator freshness/identity/budget guards, first-round service readiness, reviewed challenge hashes, precise large/dust/rate formatting and season/prize scoring.

The local fork uses existing mainnet bytecode; **zero redeployments and zero public broadcasts**. Fixture fee ETH enters only from the impersonated bound hook, then actual treasury allocation and mainnet-pool PRIO/IMD purchases fund Arena, Adapter and staking. Production owner pin/create functions open three modes with matching deadlines. Nine entries use exact approvals and persisted/exported commitments; early reveal is refused. Real reveals, ephemeral fork-only signed attestation, settle and claims yield 200/90/80 PRIO; unmet Boss threshold yields 100/90/80. Double claims revert. An unresolved round cancels after the real grace period; three refunds return 102 and escrow/locked prizes clear. These fixture budgets/signers are not mainnet settings. The hosted paid IMD service was not called. See `fork-results.json` and the reproducible runner.

The 29 browser checks cover all three primary routes, visible instructions/costs, practice without wallet transactions, keyboard validation/restart/modal focus, three local badges, zero rounds and old-round lookup/recovery errors, zero-funded staking, four visible faction reactions and offscreen stills, motion pause/reduced motion, opt-in sound, English toggle, missing wallet, verified empty season, responsive reflow, owner-only navigation/completed binding skips, blank Phase B inputs, wrong network/owner, rejected exact approval, incomplete binding fixture, RPC outage, offline configured endpoint and expired signed report. Wallet rejection is injected and sends nothing publicly. Final run: zero application/console errors and zero missing static assets. Axe scans of Turkish mobile and English desktop lobby reported zero violations.

## Better Interface review

All six domains were read, applied and reviewed against source and rendered production output. Findings and bounded measurements are consolidated in [INTERFACE-REVIEW.md](INTERFACE-REVIEW.md). `DESIGN.md` describes implemented tokens/fonts/layout/components, not proposed work. Screenshots were actually viewed at desktop/mobile sizes; final practice result readability was corrected and recaptured after a rebuild. `browser-results.json` is the full machine-readable interaction record.

## Limitations and remaining handoff

- Public project update/GitHub delivery requires platform acceptance/publisher access. This worker supplies the finished source/export; no new deployed CID/commit is claimed.
- Phase B signatures, ETH gas, fee income/allocations, real rewards/prizes and a separately operated server remain owner/operator work. Correct Phase A bindings need no repeated signatures. No production owner value or URL was guessed.
- Fork verification uses an ephemeral local signer and fixture income. It proves local execution of existing code, not availability of the real hosted oracle/operator or a public paid round.
- Physical phones, screen readers, native browser 200% zoom, background CPU profiling, audio perception and DevTools 10%-speed replay were not tested. 320px reflow and 200% text resize were tested separately.
- Measured contrast is limited to identified solid/alpha-composited surfaces; image/gradient contrast was visually reviewed but not sampled across every frame. Zero axe violations is not universal WCAG certification.
- Leaderboard reads depend on RPC historical/finalized access and may take time over large seasons; errors never publish partial rankings. Lobby scans the most recent 24 rounds and discloses the bound; manual older-round lookup remains available.
- Existing full Solidity test suite/static-analysis tools were not rerun for this frontend-only change. Accepted source compiled and deployed-runtime verification/local fork checks ran instead.

All required original artwork and four loop/still pairs remain bundled. No npm registry mirror, dependency archive, cache, node_modules or submodule is delivered. No ignore file was changed. Final artifact copies live under `artifacts/`; persistent validation evidence also lives under `docs/` because artifacts are uploaded separately.
