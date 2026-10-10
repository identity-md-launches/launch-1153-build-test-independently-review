# PRISM RIOT

Turkish-first neon arcade and wallet interface for the existing Ethereum mainnet PRIO economy, with an English toggle. The cinematic prism, logo, X link, four factions, original illustrations and animated/still media are preserved. **The complete static export is in `dist/`; the existing source manifest and lockfile are unchanged.**

- Project source destination: [launch-1153-build-test-independently-review](https://github.com/identity-md-launches/launch-1153-build-test-independently-review).
- Existing public project URL: [prio.sites.imd.fun](https://prio.sites.imd.fun/). Same hosted name: `prio.site.identitymd.eth`. Actual update status: [publication record](docs/PUBLICATION.md).
- Accepted application source: [`0345ffa67225afed469453250362e74b7f00ff42`](https://github.com/identity-md-launches/launch-1158-complete-missing-application-deployment/tree/0345ffa67225afed469453250362e74b7f00ff42).
- Official X: [@PrismRiotIMD](https://x.com/PrismRiotIMD).

## Install, run and rebuild

Use Node.js 22.16+ and npm, with the committed lockfile:

```sh
npm ci --prefix web
npm run dev --prefix web
npm run typecheck --prefix web
npm test --prefix web
npm run build --prefix web
npm run preview --prefix web
```

The build typechecks and replaces root `dist/`. Vite uses `base: './'`; navigation uses sections/dialogs, so a static gateway needs no rewrite server. Preview prints its URL. All artwork, animation stills and fonts are local. No backend, private key or paid API credential belongs in the static export. Dependency directories and caches must stay outside submission files at every nesting level.

This restricted worker installed dependencies in `/tmp/prism-riot-build/web`, copied source/config there, built there and copied the final export back. No repository `node_modules`, protected manifest, lockfile or build configuration was modified. See [actual commands and limitations](docs/VALIDATION.md).

## What visitors can do

The top navigation and first screen expose **Ücretsiz Pratik / Free Practice**, **PRIO Oyunları / PRIO Games** and **Staking**. Every game card has independent practice and real-PRIO actions, objective/scoring, current readiness, entry cost, maximum loss, actual funded prize and deadlines. Unavailable values say why. Rules and “Nasıl oynanır?” are available before wallet connection.

Practice uses local randomness: choose, lock, then reveal. It spends nothing, awards no PRIO and proves no skill. Keyboard controls and inline validation precede play. Faction choice changes appearance only. Local completion badges are separate from verified paid rankings. Sound is off until enabled; motion can be paused, respects reduced motion and stops offscreen. Real payout effects require a successful matching claim receipt.

Real entry is **100 PRIO escrow + 2 PRIO fee**, with an exact 102 PRIO approval and maximum **22 PRIO loss plus gas**. The deployed answer is `(oracleAnswer % choiceCount) + 1`. A correct reveal returns 100 plus its funded prize share; a wrong reveal returns 90; no reveal returns 80. Boss prizes additionally require the locked correct-player threshold. An unresolved cancelled round refunds 102 after the contract's result-deadline/72-hour grace rules. No unsupported combat or skill mechanics are advertised.

Reveal-secret export/import is retained. Save the private backup before changing device or gateway origin. Independent round lookup, reveal, settlement/cancellation, claim/refund, staking withdrawal and reward claim remain accessible when unrelated operating configuration or operator service fails. Each transaction displays simulation, wallet confirmation, receipt wait, success/error and its explorer link. Recovery still verifies its target runtime and real contract eligibility.

Staking displays actual reserve, reserved liabilities, stream status, rate and claimable rewards before confirmation. Deposits do not create income. With the observed zero funding, the banner says **“Deposits work; rewards are not currently funded or streaming.”** Token amounts use precise BigInt formatting. The accepted deployed vault encodes `rewardRate` at 36 decimals (wei/second with another 18 precision digits); the UI formats it once as `fmt(rate, 9, 36)`, without a prior division. Ordinary token amounts use 18 decimals. [Source verification and funded fork evidence](docs/CHAIN-VERIFICATION.md).

UTC calendar-month leaderboards scan finalized Arena `Claimed` events from deployment, verify receipts, canonical block hashes, round/entry state and the contract's payout formula, then rank **sum(max(payout − 100 PRIO, 0))**. Returned escrow and refunds earn no score; ties use address order. Partial RPC reads produce an error, never a partial ranking. Badges are informational and confer no token value or reward rights. Published round questions supply paid challenges; IMD proposals require reviewed signed operator content and explicit owner approval for a future round.

## Current readiness and owner handoff

Fresh mainnet reads on 2026-10-10 confirmed **all nine Phase A bindings correct**. Full source/ABI/runtime verification passed at block **26160822**; subsequent browser reads reconfirmed bindings. Both executors, treasury IMD, adapter Intake/payment, pool/floors and callback/paid settings remain incomplete. Treasury income/operating balances, staking reward reserve/rate, Arena rounds and prize pools were zero. These are dated observations; the interface reads fresh state and distinguishes configuration, operator, RPC and frontend failures.

The owner sees **Sahip ayarları / Owner setup** and **Tur yönetimi / Round management** in top navigation. Phase A still simulates, checks receipts, skips correct settings and stops on any conflict; irreversible-binding safeguards remain. Do not repeat completed signatures. Phase B accepts reviewed values separately; no executor, floor or operating budget is guessed.

Remaining real operation requires:

1. Owner-reviewed Phase B settings and wallet signatures with ETH gas. Re-read live prices/Intake data. Configuration alone creates neither a round nor rewards.
2. Actual fee income and permitted allocation/purchases to fund operating budgets, adapter IMD, prizes and staking rewards. Without sufficient income, operate free practice only.
3. A separately hosted operator, matching executors, working oracle callback/relay and funded bounded request/gas budgets. Publish its verified public HTTPS status URL in `web/public/project.json`, then rebuild. The value remains `null` until such a server exists; players never paste a server URL. [Operator handoff](docs/OPERATOR.md).
4. In Round management, review the exact canonical question hash and Intake body, choices/scoring, UTC deadlines and available on-chain prize. Approve the public rules, then separately sign `OracleAdapter.pinQuestion` and `Arena.createRound` with matching commit/notBefore deadlines. Both are simulated, receipt-checked and read back. Missing funding or verified operator readiness prevents opening paid rounds. Current round rules stay locked.

No token, pool, hook or application contract was redeployed. Existing addresses and all source provenance are recorded in [CHAIN-VERIFICATION.md](docs/CHAIN-VERIFICATION.md). The predecessor Solidity source and historical guides remain as reference; application ABI/runtime checks use the accepted deployed source.

## Reproduce validation

```sh
npm test --prefix web
node web/scripts/check-chain.mjs
node web/scripts/verify-chain.mjs /path/to/compiled/accepted-source
# Install browser outside submission artifacts if needed:
npx --prefix web playwright install chromium
node web/scripts/browser-check.mjs
# Requires Anvil and live fork RPC reads; script broadcasts ONLY to its own loopback node:
web/node_modules/.bin/tsx web/scripts/fork-check.ts
python3 web/scripts/check-bundle.py
```

The browser runner serves the real export under `/preview/` and closes its own server/browser. Optional `PRISM_REVIEW_DEPENDENCIES` points to an external installation and `PRISM_REVIEW_CHROMIUM` to an existing Chromium executable. The fork runner starts/stops Anvil itself; its ephemeral signer and fixture funding never leave the local fork. No key is persisted. Actual results: **40 unit tests; 12 read-only chain checks; 29 browser checks; six funded fork check groups**. The final export, screenshots and six-domain Better Interface review are documented in [VALIDATION.md](docs/VALIDATION.md) and [INTERFACE-REVIEW.md](docs/INTERFACE-REVIEW.md). These are worker checks, not an independent security certification.

## Publish the existing project

Publish the **contents of the finished `dist/`**, without rebuilding at the publisher. Preserve the existing `prio` name and URL:

```sh
imd site publish ./dist --name prio
imd site status <site-id-returned-by-a-successful-publication>
```

A launched project's name may require IdentityMD's project publisher instead of the member-site CLI. The accepted job handoff must deliver source to the existing GitHub repository and update `prio.site.identitymd.eth` to this export. Do not create another token or substitute a new site name. A current URL alone is not proof that this version was published. Record the delivered commit/CID and compare the served entry module/assets after publication. [Actual attempt and remaining handoff](docs/PUBLICATION.md).

`DESIGN.md` documents the final implementation. `docs/ASSETS.json` records all 24 required art files and stills. `docs/BUNDLE-CHECK.json` records the complete submission size; source and runtime media remain complete and no ignore file was changed.
