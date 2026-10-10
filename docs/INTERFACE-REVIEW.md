# Better Interface review — 2026-10-10

The implementing worker read the pinned Better Interface workflow, all six domain cores and `document-web-design`, applied them during implementation, and inspected the production export under `/preview/`. This review supplements actual interaction checks; it is not independent certification.

## Six-domain coverage

| Domain | Review and evidence | Limits |
| --- | --- | --- |
| Accessibility | Native buttons, labeled decimal fields, 44px percentage buttons with `aria-pressed`, adjacent live prerequisite lists, keyboard practice/shortcuts, dialog Escape/focus return, reduced-motion stills and opt-in sound. Automated axe scans at desktop and 320px found zero violations; results are in the final browser report. | No physical screen reader, hardware wallet or phone. |
| Layout | Buy PRIO in desktop/mobile navigation and hero. At 1200px+, the financial card shares the hero; below that it follows immediately. Real production reflow checked at 1440, 850, 390 and 320px. Founder controls are a collapsed owner-only section after staking/diagnostics, near the footer. | Native browser zoom not performed; 200% text resizing and narrow reflow checked separately. |
| Writing | English-only, including saved Turkish preference migration. Each unavailable financial action lists its wallet/network/read/input/balance/gas/approval/quote prerequisites and recovery step. No reward stream is explicitly disclosed before staking. Free practice, paid game costs, principal, funded prizes and readiness are distinct. | Third-party RPC/wallet wording cannot be exhaustively enumerated; known localized errors receive English recovery copy. |
| Typography | Existing local Barlow Condensed/Space Grotesk fonts preserved. Financial inputs use 16px text; amount buttons 14px; explanatory messages 12–13px. Headings, amounts and body remain distinct. Large numbers use exact base-unit calculations and display formatting. | Font rendering across operating systems not exhaustively checked. |
| Colors | Existing ink, cyan, pink and acid-yellow tokens preserved. Functional financial cards have solid dark surfaces; selected percentages have a border/pressed state as well as color. Computed-color measurements below supplement screenshot review. | Gradients/artwork were visually reviewed, not sampled at every pixel/frame. Disabled opacity is not treated as measured enabled-control contrast. |
| UI and motion | Existing artwork, logo, faction reactions, animated/still pairs, X link, practice controls, reveal recovery and dialogs retained. Swap defaults to Buy/empty input. Debounced quotes, manual retry, receipt feedback, precise shortcuts and bounded approvals provide explicit next steps. | No audio perception, CPU profiling or DevTools 10%-speed replay session. |

## Findings fixed and checked

| Severity | Final source location | Finding and correction | Evidence |
| --- | --- | --- | --- |
| High | `web/src/wallet.ts:28` | Original `accountsChanged` could restore an account after disconnect without a signing client. Session account/client/chain now update atomically, with stale response rejection and fresh clients after changes. | Controlled provider reproduced the original hosted bug; reconnect, restoration, lock and network changes exercised on the export. |
| High | `web/src/wallet.ts:37`, `web/src/wallet.ts:105` | A disconnected client captured by an asynchronous action needed invalidation; viem wrapped the useful error in generic RPC text. Guarded transport prevents signing and preserves the English reconnect instruction. | Disconnect during router simulation, plus nested-error unit regression. |
| High | `web/src/financial-ui.tsx:9`, `web/src/App.tsx:40` | Old receipt callbacks could refresh a previous account. Session-key guards prevent stale refreshes from overwriting current wallet state. | Account-change/reset and receipt refresh browser checks; source review of both readers. |
| High | `web/src/chain/financial-read.ts:30`, `web/src/financial-ui.tsx:35` | Global oracle/IMD reads and silent shared readiness disabled valid financial actions. Reads now verify action-specific targets; blockers are adjacent and actionable. | Induced game RPC failure leaves buying/staking usable; corrupted vault code blocks staking with an explanation while swapping remains independent. |
| High | `web/src/financial-panels.tsx:122`, `web/src/chain/gas.ts:6` | Staking falsely said “Deposits work” while blocked. It now shows actual wallet prerequisites, stream status, exact approval/deposit sequence and independent withdrawal/claim. Every write rechecks estimated gas affordability. | Zero-reward approval/deposit/withdraw and funded claim on deployed vault bytecode in local Anvil. |
| High | `web/src/amounts.ts:1`, `web/src/financial-ui.tsx:46` | Financial inputs lacked safe balance shortcuts. BigInt percentages round down; ETH reserves buffered gas; selection only fills editable input and resets on changes. | Dust/large/zero unit tests and browser percentages, manual editing, wallet changes and MAX buy execution. |
| Medium | `web/src/App.tsx:114`, `web/src/App.tsx:165`, `web/src/style.css:2850` | Buying was secondary and owner setup too prominent. Buying now leads navigation/hero/first card; founder section is collapsed near the footer. Initial desktop hero clipping found in screenshots was fixed by bounding the hero content width. | Desktop/mobile screenshots actually viewed; owner-only and collapsed-position assertions. |
| Medium | `web/src/i18n.ts:1`, `web/src/main.tsx:1` | Turkish persisted state could still control rendering. Removed locale branches, dictionary and selector; legacy language storage is deleted and document language is English. | Saved `prism-language=tr` browser fixture; English owner/player/recovery flow checks and source scan. |
| Medium | `web/src/chain/read.ts:541` | Activity RPC rejected the delivered OR-topic log request. Bounded address-only event reads now decode only known ABI events. | Read-only mainnet regression returned 28 decoded events; no invented activity. |

## Bounded contrast measurements

Measured from actual browser-computed solid foreground/background with the WCAG luminance formula. Exact raw values are in the browser result and `artifacts/financial-browser/contrast.json`.

| Surface | Colors | Ratio |
| --- | --- | --- |
| Financial card | `#f8f5ff` on `#181624` | 16.54:1 |
| Swap output and unselected percentage button | `#f8f5ff` on `#211e32` | 15.04:1 |
| Gas and prerequisite text | `#b9b3cc` on `#181624` | 8.81:1 |

The tested disabled primary button's raw colors are also captured, but its opacity is excluded from these enabled/text assertions. No universal contrast or WCAG conformance is claimed.

## Evidence

Actual final captures are retained in `docs/screenshots/`: desktop/mobile hero, mobile staking and collapsed founder controls. All 32 final browser checks passed, with zero page/console errors and missing assets. The full capture set and axe JSON are under `artifacts/financial-browser/`. The worker viewed rendered screenshots, corrected the hero clipping and reran the final production checks. `docs/browser-results.json` contains the actual final checks and limitations; `docs/VALIDATION.md` records commands/results. `DESIGN.md` documents implemented tokens/components/layout from source.
