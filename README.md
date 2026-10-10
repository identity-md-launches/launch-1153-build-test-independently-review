# PRISM RIOT — the arcade is yours

A working React/TypeScript arcade and Ethereum mainnet interface for the existing PRISM RIOT economy. The cinematic lobby includes four original illustrated factions, three free practice games, four looping WebP environments, wallet connection, verified contract reads, protected ETH/PRIO swaps, staking, round recovery and owner setup.

The **production static export is included in `dist/`** alongside the source and `web/package-lock.json` for the platform's Git delivery. It uses relative assets and hash navigation for IPFS gateway subpaths. All artwork, logo, icons and fonts are bundled locally. There is no browser key, paid IMD API call or hosted server operator.

- Source delivery target: [existing application repository](https://github.com/identity-md-launches/launch-1158-complete-missing-application-deployment).
- Accepted application contracts: commit [`0345ffa67225afed469453250362e74b7f00ff42`](https://github.com/identity-md-launches/launch-1158-complete-missing-application-deployment/tree/0345ffa67225afed469453250362e74b7f00ff42).
- Public IPFS URL, CID and publication status: [publication record](docs/PUBLICATION.md).
- Official X: [@PrismRiotIMD](https://x.com/PrismRiotIMD).

## Install, develop, preview and rebuild

Use Node.js 22.16+ and npm. No Foundry configuration or existing dependency was changed for this website.

```sh
npm ci --prefix web
npm run dev --prefix web
npm run typecheck --prefix web
npm test --prefix web
npm run build --prefix web
npm run preview --prefix web
```

Vite prints the local dev/preview URL. `npm run build --prefix web` first typechecks and then replaces root `dist/` with the complete export. `web/vite.config.ts` sets `base: './'`. Preview serves the export; IPFS publication does not rebuild it. Dependency folders are disposable and must not be included in the Git submission at any nesting level.

Additional verification:

```sh
# Live, read-only Ethereum integration checks. No transaction is sent.
node web/scripts/check-chain.mjs

# Code/owners/receipts/ABIs/pool report using bundled verified runtime baselines.
node web/scripts/verify-chain.mjs

# Optional full comparison with a separately downloaded and built accepted commit.
node web/scripts/verify-chain.mjs /path/to/accepted-source

# Browser suite starts its own /preview/ server and closes server/browser on exit.
npx --prefix web playwright install chromium
node web/scripts/browser-check.mjs
```

The browser checker accepts `PLAYWRIGHT_BROWSERS_PATH` or `PRISM_REVIEW_CHROMIUM` for an existing compatible Chromium. A normal machine must provide Chromium's shared libraries and fonts. The machine-specific temporary-browser fallback actually used for this assignment is recorded in [validation](docs/VALIDATION.md). It is not a runtime website dependency. Live integration checks assert the configuration observed during delivery; update those state-specific expectations after the owner configures the economy.

## What the interface does

- **Arcade:** three clearly labeled local practice games with choice/reveal/attack transitions. They use browser randomness, spend no tokens and never create leaderboard entries or claimable prizes.
- **Factions:** Emberclaw, Neon Tide, Frostfang and Stormveil, each with its own commissioned portrait, environment, visible loop and still fallback. Selection is cosmetic and reactive.
- **Wallet:** injected Ethereum wallets, account/chain changes, balances, explicit mainnet switching and recoverable missing/rejected-wallet states. No signature is requested merely to connect.
- **Swaps:** live quoter simulation of the actual ETH/PRIO pool and hook, 60-second quotes, 0.01%–5% slippage, nonzero minimum output and bounded settlement. The exact router transaction is simulated again before wallet confirmation. Exact PRIO approval to Permit2 and an exact router allowance with a maximum 20-minute expiry are used for sells. No unlimited approvals or website swap fee.
- **Fee disclosure:** current LP and directional platform protocol fees, their combined rate, immutable extra 0.5% treasury hook fee on the ETH leg, an included hook-fee estimate and separate Ethereum gas. Failed/no-fill quotes do not invent a price.
- **Staking:** exact-amount approval, stake, withdraw, claim actual funded rewards and revoke allowance. Zero funding is shown as zero, with no fixed APY or promised profit. Reward rate is displayed using the contract's 36-decimal internal scale.
- **Rounds:** actual `enter(roundId, commitment)`, `reveal(roundId, choice, salt)`, `claim(roundId)` and `refund(roundId)` plus permissionless settle/cancel. All modes share the deployed scoring. Deadlines, prize funding, maximum loss, escrow, result evidence and per-wallet outcomes come from live state.
- **Recovery:** cryptographically random reveal salts are stored locally before entry; explicit private JSON export/import binds chain, Arena, account and round. Backups are never sent to the operator endpoint. A reveal is locally prechecked against the current on-chain window and commitment before its salt is included in RPC simulation. Keep a backup when changing IPFS gateway origins.
- **Treasury/leaderboard:** live allocations, funding and bounded event history queries. The leaderboard ranks real Arena claim amounts in the selected block window, explicitly including returned escrow; it is not a profit ranking.
- **Owner setup:** the seven Phase A transactions in the required order, code/owner/address verification, exact calldata export, individually simulated wallet confirmation and receipt recheck. Correct settings are skipped; a conflict anywhere stops execution. Phase B separately reads fresh protocol/pool data and accepts explicit owner-reviewed values. No operator wallet is guessed.
- **Operator:** optional public HTTPS status reports are verified against the actual on-chain executor, expire within five minutes, bind the exact chain/Arena and report budget-limited activity. A valid report alone cannot override missing configuration, funds or funded prizes. The static website does not host the operator. [Schema and trust model](docs/CHAIN-VERIFICATION.md#separate-operators-public-status-protocol).

Rewards animate only after a successful claim receipt with the matching contract/player/round event. Free practice results are always identified as simulations. Idle environmental motion is separate from transaction state. Sound starts muted and plays only after an explicit sound toggle and later user actions. Reduced motion replaces raster loops with stills and disables parallax, breathing, particles and transitions; visible pause controls also work independently of the OS setting. Offscreen/hidden-tab portrait loops pause.

## Actual deployment readiness

No token, hook, pool or application contract was deployed or changed by this website task. Ethereum chain ID is **1**.

| Contract | Existing address |
| --- | --- |
| PRIO | `0xfd1c234972768c23bb21d655966e0b122dd67a2c` |
| TreasuryFeeHook | `0x65a783cc6725a02ce349dc4d72577994df1760cc` |
| FeeTreasury | `0xb68b1ba47734ba91f3fc37164bb39d408908ff7c` |
| StakingVault | `0x10373c4afc7851b8ab5d94dce7ec1688624cec33` |
| Arena | `0xe31277d4e9fbf9fc35239dc7d2280e97d5c817c1` |
| OracleAdapter | `0x002021b4aeb4125ff25e0353b004f6fdec5f93ed` |

Owner: `0x13afb9b5780cd9ae79c61503adb69c57845d8eac`. PoolManager: `0x000000000004444c5dc75cb358380d2e3de08a90`.

At the verified delivery observation, all runtimes and owners matched and both deployment receipts succeeded, but Phase A bindings remained unset. No rounds, funded staking rewards or prizes existed, and paid requests were disabled. A buy quote and the exact Universal Router buy call simulated successfully; the tested sell quote reverted. **The website does not label the economy configured or paid games ready.** Each new action obtains fresh state. Eligible withdrawals, reveals, claims and refunds verify their own contract target and are not blocked by unrelated owner/treasury/operator configuration failures.

Full source provenance, canonical ABI comparisons, live blocks, receipts, pool details, current budgets and actual executed verification commands: [CHAIN-VERIFICATION.md](docs/CHAIN-VERIFICATION.md) and [machine-readable chain report](docs/chain-verification.json).

The starting workspace contains predecessor contract source and ABIs. These are preserved without modifying protected build/dependency files. The website's application ABI comes from the accepted application commit under `web/src/chain/abi/`. The copied [deployment guide](docs/DEPLOYMENT.md), [configuration plan](docs/reference/ConfigPlan.s.sol) and [historical predecessor README](docs/CONTRACTS-HISTORICAL.md) are explicitly historical reference data, not a claim that old deployment status is current.

## Publish on IPFS and submit source

After the final build and checks, publish the complete export through the official paired IdentityMD worker:

```sh
imd site publish ./dist --name prism-riot
imd site status <returned-site-id>
```

Record and verify the actual public URL/CID. The command publishes the static files using worker device authentication; it neither signs an Ethereum transaction nor puts keys into browser code. Updating the name creates a new immutable content revision. The public name belongs to the publishing contributor seat, so production ownership/future updates should be coordinated through the project delivery platform. See [PUBLICATION.md](docs/PUBLICATION.md) for the actual result and limitations.

This task submits source, lockfile and `dist/` through the IdentityMD job handoff to the requested existing GitHub repository. The platform supplies the final delivered commit/PR after accepting the bundle. An existing repository URL alone is not evidence that the new source has already been pushed.

## Validation, design and assets

- [Validation report](docs/VALIDATION.md): actual production/typecheck/test/browser results, fixes, six Better Interface domains, coverage and limitations.
- [Implemented design system](DESIGN.md): final tokens, typography, components and responsive behavior.
- [Asset manifest](docs/ASSETS.json) and [art direction/provenance](docs/ARTWORK.md): eight original commissioned raster artworks, four animated WebP loops, still fallbacks and local official identity assets.
- [License notices](docs/licenses/): original repository MIT license remains; downloaded fonts retain SIL Open Font License notices. Pinned Better Interface/Impeccable attribution is retained separately.

The export is usable without a server. Live financial data/actions require an Ethereum RPC and a compatible wallet; paid games additionally require the owner’s real configuration/funding and a separately operated server. No public wallet transaction was broadcast during implementation. Passing local checks does not establish absence of contract or financial risk.
