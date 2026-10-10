# PRISM RIOT delivery validation

Date: 2026-10-10. This is the worker's actual verification record, not an independent network certification or proof of security.

## Delivered implementation and current completion

The React source, locked frontend dependencies, complete root `dist/`, original artwork/animations, design documentation and verification evidence are ready for project delivery. The final production runtime is `assets/index-DbF_2qlm.js` with `assets/index-Bov3UerZ.css`. All local implementation checks below pass.

**Publication remains incomplete.** The official IMD publishing command accepted a 2,115,058-byte bundle upload but returned HTTP 503 `member_sites_closed` (“this plane names no member sites”). It supplied no site ID, IPFS CID or public URL. The worker did not invent one or represent the existing GitHub repository as a newly pushed commit. The platform's separate project publisher must deliver the accepted files to the specified repository and IPFS. [Exact publication record](PUBLICATION.md).

The live application economy is also **not configured**, independently of website publication: the verified contracts exist, but bindings, funded rewards/prizes and paid requests remain unset/zero/disabled. The UI reads and displays that condition. Future owner transactions and a separately operated, funded server are required to enable paid play. No application deployment, blockchain signature or public transaction was performed by this task.

## Actual commands and results

Commands run from the repository root unless noted. Node 22.16.0 was installed in `/tmp/prism-tools` for the frontend build; the pre-existing Node 24 runtime was used for some independent checks and the official publishing CLI. Temporary tools, dependencies, browser binaries, caches and source archives are not submission artifacts.

| Command / check | Result |
| --- | --- |
| Read all pinned project/deployment/network and Better Interface inputs; accepted README, deployment guide, ConfigPlan and compiled ABIs | Completed; the starting workspace was identified as the predecessor contract tree |
| `npm install --prefix web --no-audit --no-fund --cache /tmp/prism-npm-cache` | Passed; exact dependency versions recorded in new frontend manifest/lockfile |
| `npm run typecheck --prefix web` | Passed on final source |
| `npm run build --prefix web` | Passed on final source, including typecheck; 2,665 modules transformed; complete static export produced |
| `npm test --prefix web` | **33 passed, 0 failed**; no public transactions or network signatures |
| `forge build --root /tmp/prism-accepted` | Passed against the accepted application commit; existing warnings recorded in chain report; no repository Solidity changes |
| `node web/scripts/verify-chain.mjs /tmp/prism-accepted` | Passed at mainnet block **26160349**; ABIs, deployed code, owners, creation receipts and PoolKey verified |
| `node web/scripts/check-chain.mjs` | **14 passed**, live read-only checks at block **26160354** |
| `node web/scripts/browser-check.mjs` with temporary browser/font/library overrides | **21 passed, 0 failed** against the final exported JS/CSS; four responsive widths, actual screenshots and interactions |
| `python3 web/scripts/check-bundle.py` after removing disposable dependencies | Passed; all 24 art hashes/export copies and three font hashes match, lockfile matches, relative references resolve, protected paths unchanged, no submodules or dependency/cache files; complete archive below 8 MiB |
| `imd site publish ./dist --name prism-riot` using the installed official CLI | **Failed**, exit 1; HTTP 503 `member_sites_closed` after bundle upload; no public site URL issued |
| Real wallet signature / public transaction / paid IMD request | **Not executed**; all require the appropriate real owner/player/operator authority |
| Existing Solidity test suite, Slither, Aderyn | **Not executed for this frontend-only change**; Forge and Slither available, Aderyn absent; no contract source modified |

The final build was repeated after the last chain formatting/freeze; generated runtime filenames and content were unchanged from the successful final browser run. Vite uses `base: './'`; all required visual assets and fonts are local. The final source/export integrity and byte checks are in `BUNDLE-CHECK.json`.

## Useful interaction and safety coverage

Offline tests exercise slippage bounds and monotonic minimums, exact router input settlement and output minimums, native dust refunds, expired quotes, bounded approvals, correct approval simulation, chain/account changes, rejection/reversion/replacement handling, and confirmation only after a successful receipt. The reveal tests bind chain/Arena/player/round/choice/salt, verify storage before entry, prevent wrong-key reuse and conflicting imports, and stop early/late/mismatched reveals before sending a salt to RPC simulation. Recovery tests verify that unrelated setup failures cannot block withdrawals/refunds while a changed target runtime still blocks unsafe calls. Phase A tests verify all seven calldata/order steps, conflict stops and owner checks. Operator tests verify canonical signatures, actual executor identity, freshness, chain/Arena/block binding and budgets; a signature cannot override incomplete on-chain setup.

Live checks verify the actual mainnet pool and hook fee, real quoter output, the exact deployed Universal Router buy calldata, owner A1 simulation, unconfigured/funding gates, event retrieval, Intake price and an owner-review candidate ETH/IMD pool. A buy quote and full router buy simulation succeeded; the observed 100 PRIO sell quote reverted and is surfaced as a failure rather than a fabricated price. Treasury/rate/price observations are block-specific, not promises about future state. Full details are in [CHAIN-VERIFICATION.md](CHAIN-VERIFICATION.md) and [chain-verification.json](chain-verification.json).

The browser tests exercised actual mobile navigation, faction selection, all four visible animated raster loops and still fallbacks, global pause, reduced motion, missing-wallet handling, practice choice/reveal/restart, dialog keyboard navigation/Escape/focus return, owner Phase A/B read-only states, a live swap quote, zero-funded staking, a mocked owner connection and wrong-network switch, rejection and RPC failure. The mocked wallet did not call any signing or transaction method. There were zero page errors, console errors or HTTP error responses in the final run. Deliberately changed image sources caused nine cancelled image requests; all final images decoded successfully.

## Six-domain Better Interface review

All six domains were read and applied during implementation: accessibility, layout, writing, typography, colors and UI. Dedicated review found and fixed unnamed mobile wallet controls, unreadable hero metadata over bright art, 6–8px metadata and duplicated TTF font packaging. Source review also found and fixed stale quote input races, reveal-key/account mismatches, Phase A conflicts, receipt replacement semantics, premature reveal simulation and reward-rate decimal display.

The consolidated source locations, findings, corrections, measured contrast pairs, screenshots and exact browser command are in [INTERFACE-REVIEW.md](INTERFACE-REVIEW.md). Machine-readable results are in [browser-results.json](browser-results.json). `DESIGN.md` documents the actual final tokens, fonts, components, responsive behavior and motion rules. The final desktop hero, mobile hero, four faction portraits and practice result screenshots were inspected by the primary worker as well as the dedicated reviewer.

## Explicit limitations and unperformed checks

- The platform refused direct member-site publication. No public URL/CID or new GitHub commit is claimed; project hosting/delivery remains an external handoff requirement.
- No real wallet transaction was broadcast. There were no live rounds available for an end-to-end paid enter/reveal/claim/refund sequence; those paths were checked using actual ABIs, simulations and isolated tests instead.
- The static website does not operate an IMD server. It consumes only verified public reports from a separately configured executor and otherwise shows no agent activity/readiness.
- Browser MCP lacked Chrome. The permitted foreground Playwright fallback used official Chromium and temporary libraries/fonts, not modified system configuration.
- Chromium emulation is not a physical phone, screen-reader session or native 200% zoom test. RTL/localization, audio perception, background-tab CPU profiling and DevTools animation playback at 10% speed were not performed.
- Solid text/action contrast pairs were measured. Image/gradient backgrounds were visually reviewed but not exhaustively sampled across every frame. An axe scan with zero violations is not full accessibility certification.
- Historical public RPC reads initially hit a 403 on one endpoint; verification succeeded through the other pinned RPC. Future RPC availability is not guaranteed; the UI exposes unavailable/stale data and retry behavior.

## Art and packaging

Eight distinct original base illustrations were generated through the available built-in image tool, with the supplied logo used as the identity reference: a wide hero, four faction portraits/environments and three arena/boss illustrations. Four authored 24-frame/three-second WebP loops provide flame, bioluminescence, frost and lightning. Every loop has a still fallback, responsive variants are used, and no art is runtime-hotlinked. Finished raster assets total 1,853,755 bytes. [Manifest](ASSETS.json), [art documentation](ARTWORK.md), and font/design-guide notices under `licenses/` record provenance and licensing limitations.

No existing build configuration/dependencies, `.git/`, `.github/`, `.env` file or ignore file was modified. No submodule was created. Generated dependency/cache directories and archive intermediates were removed from the submission. Required source/runtime assets remain complete. Final exact file sizes and integrity checks are recorded in [BUNDLE-CHECK.json](BUNDLE-CHECK.json). The compressed archive check is recorded separately in `artifacts/bundle-check-final.json`, since storing an archive's own size inside it would change that size.
