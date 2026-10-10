# Better Interface: six-domain review

Reviewed 2026-10-10 by the implementing worker against the actual root `dist/` export, served beneath `/preview/`. Final entry: `index-B8OTgtTI.js`; final stylesheet: `index-DCGITOhP.css`. The pinned workflow and all six domain cores informed implementation. Turkish and English are supported; no new light theme or RTL variant was requested.

## Coverage

| Domain | Status | Inspected evidence and limits |
| --- | --- | --- |
| Accessibility | Checked | Native links/buttons/labels/dialogs, visible skip/focus, Tab/Space/Enter practice, Escape/focus return, inline/live errors, motion pause/reduced-motion, named wallet control. Axe: zero violations in Turkish mobile and English desktop lobby. No physical assistive technology or screen-reader session. |
| Layout | Checked | Actual production at 1440×1000, 850×1000, 390×844 and 320×844: scrollWidth equals viewport width. Three main nav items visible, hero actions explained, game costs/action separation readable, owner fields wrap. Desktop 200% text resize passed; native browser zoom not performed. |
| Writing | Checked | Turkish first with English toggle. Free/random/no-token/ cosmetic faction labels; exact escrow/fee/max loss; no rounds explain missing values; readiness distinguishes configuration, RPC and operator. Staking separates deposits from funded rewards. Technical contract/RPC details can remain English inside Turkish explanations. |
| Typography | Checked | Local Display/Space fonts loaded through the export. Responsive heading hierarchy, 16px fields, larger financial instructions and precise tabular amounts. Final practice choices/result made readable after screenshot review. Platform-specific font rendering not exhaustively tested. |
| Colors | Checked, bounded | Solid/alpha-composited pairs measured from browser-computed colors below. Dark functional surfaces preserve neon artwork. Text/icons supplement color. Hero image/gradient contrast visually inspected but not sampled at every pixel/frame. |
| UI / motion | Checked | Same logo/prism/faction/boss media; visible distinct free/real actions; five expandable readiness details; native modal/lazy-loading states; owner-only nav. Four visible loops show changing frames and pause offscreen; dragon/frog/wolf/raven selection reactions, actual practice attack/reveal/result, reduced-motion stills and opt-in sound checked. Sound perception/CPU profiling/10%-speed replay not performed. |

## Findings, corrections and rechecks

| Severity | Final source | Evidence / correction | Recheck |
| --- | --- | --- | --- |
| High | `web/src/App.tsx:81`, `:95`, `:108` | Prior attractive lobby obscured practice versus paid actions. Added visible three-path navigation, explained hero actions, how-to before games and two actions on every card. | All routes/cost labels/readiness anchors checked at four widths; screenshots viewed. |
| High | `web/src/readiness.tsx:8`, `web/src/chain/read.ts:340` | Missing operating configuration could be confused with broken frontend or no operator. Added current nine-binding detail and distinct Phase B/funding/service/round/RPC states, without resetting completed settings. | Fresh reads plus incomplete binding, RPC outage, absent/offline/expired endpoint fixtures pass. |
| High | `web/src/panels.tsx:248`, `web/src/ui.tsx:186` | Deposit UI needed clear zero funding and accurate units. Added reserve/liability/stream/claimable summary; precise BigInt formatting and one explicit 36-decimal rate conversion matching deployed code. | Zero-funding browser flow; dust/large/rate unit test; real funded fork observation. |
| High | `web/src/chain/round-admin.ts:23`, `web/src/round-manager.tsx:9` | No owner path from configuration to a funded round. Added reviewed pin/create sequence with service/funding/owner checks, exact deadline/rules binding and receipt/readback validation. | All three modes created with actual deployed ABIs on local fork; blank inputs, wrong wallet/network and conflicts tested. |
| Medium | `web/src/chain/seasons.ts:21`, `web/src/season-board.tsx:10` | Prior block-window claim ranking counted returned principal. Replaced with dated finalized/receipt-verified prize-share seasons and separate local completion badges. | Empty live season and unit scoring/boundary checks; receipt validation source review. |
| Medium | `web/src/project-state.ts:14`, `web/src/chain/operator.ts:130` | Player-entered server URL prevented a coherent public project. Added one published endpoint setting, auto fetch/expiry and retained signed executor/budget checks; absent server remains explicit. | Configured 503 and expired signed status fixtures; no player URL field. |
| Medium | `web/src/style.css:2694` | Dense mobile hierarchy and hidden navigation made choices harder to scan. Refined header wrapping, explanatory actions, card metrics and expandable operations without replacing artwork. | No overflow at 1440/850/390/320; desktop/mobile screenshot review and text enlargement. |
| Medium | `web/src/style.css:1608`, `web/src/practice.tsx:43` | Initial result screenshot dimmed locked choices and used small result text. Kept locked choices opaque, raised labels/result to 12–13px, and waited for result animation to finish before capture. | Final screenshot viewed; keyboard/result/restart checks pass after final rebuild. |
| Low | `web/src/panels.tsx:260`, `web/src/rounds.tsx:121` | Translation conversion initially collapsed spacing around token units in JSX. Restored explicit spaces. | Final zero-reward and real-play browser text checks pass. |
| Test harness | `web/scripts/browser-check.mjs` | Native BODY/browser-chrome focus was mistaken for an interactive background escape; lazy panels/account-change render also needed explicit waits. Assertions now reject background controls and wait for real panel/owner visibility. | All 29 final tests pass; no production readiness bypass added. |

## Measured contrast

Actual browser-computed foreground/background, using WCAG relative luminance. For transparent secondary actions, the alpha background was composed through solid ancestors. No image/gradient background was assigned a fabricated solid ratio.

| Rendered selector | Foreground / background | Ratio |
| --- | --- | --- |
| `.game-content > p` | `#b9b3cc` / `#181624` | 8.81:1 |
| `.game-actions .primary` | `#10101d` / `#f4f46d` | 16.17:1 |
| `.game-actions .secondary` | `#f8f5ff` / composite RGB(29.544,27.592,41.256) | 15.62:1 |
| `.readiness-tile` | `#f8f5ff` / `#181624` | 16.54:1 |
| `.badge.cyan` | `#7ce7ff` / `#16303a` | 9.70:1 |

Raw measurement: `artifacts/contrast.json`. These five pairs do not establish universal contrast or accessibility compliance.

## Rendered evidence and completion

The worker viewed desktop/mobile hero screenshots, game cards/how-to, factions, staking and final practice result. Persistent files: `docs/screenshots/hero-desktop.jpg`, `hero-mobile.jpg`, `factions-mobile.jpg`, `practice-mobile.jpg`. Additional game-card and staking captures are under `artifacts/`. Screenshots are actual production renders; random practice outcomes can differ across runs.

`docs/browser-results.json` records all 29 passing interaction checks, four viewports, zero page/console errors and zero missing static assets. `docs/VALIDATION.md` records exact commands, mainnet/fork checks and limitations. `DESIGN.md` follows the pinned implemented-design documentation method.

Complete for this local implementation/interface-review scope. Public update remains incomplete because the publisher refused it; real economy readiness still requires owner signatures/funding and a separately hosted operator. No independent security, full WCAG, physical-device or hosted-service certification is claimed.
