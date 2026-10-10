# PRISM RIOT design system

## Overview

The existing cinematic neon arcade now leads into three clear paths: free practice, real PRIO rounds and staking. Turkish is the first language; English is available in the header. The prism, original logo, four faction illustrations, three arena images and official X identity are preserved. Financial information uses quiet dark surfaces, visible costs and expandable operational detail. Art never substitutes for readiness evidence.

Source of truth: `web/src/style.css` tokens and its final “play/readiness refinement” block, `App.tsx`, `ui.tsx` and focused panels. The final refinement overrides older breakpoint rules; those old declarations are not alternate design values. `docs/ASSETS.json` lists the 24 local required media assets. `docs/INTERFACE-REVIEW.md` records measured/rendered evidence and limits.

## Colors

Canonical hex tokens in `web/src/style.css:20`:

| Semantic token | Primitive / value | Use |
| --- | --- | --- |
| `--bg` | `--violet-950`, `#10101d` | Page and dialog background |
| `--surface` | `--violet-900`, `#181624` | Cards and readiness tiles |
| `--surface-raised` | `--violet-850`, `#211e32` | How-to, selected tabs, inset explanations |
| `--border` | `--violet-750`, `#393249` | Field and group boundaries |
| `--text` | `--gray-100`, `#f8f5ff` | Main text |
| `--muted` | `--gray-400`, `#b9b3cc` | Supporting text and labels |
| `--action` | `--yellow-300`, `#f4f46d` | Filled primary action |
| `--action-text` | `#10101d` | Text on yellow |
| `--focus`, `--success` | `--cyan-300`, `#7ce7ff` | Focus and explicitly labelled confirmed state |
| `--error` | `#ffacb8` | Inline error text |
| Brand/faction accents | `#ff76b8`, `#beef5d`, `#7ce7ff`, `#c1a0ff` | Dragon, frog, wolf and raven selection |

Status uses words and icons as well as color. Hero art has a strong dark scrim; hero secondary actions use `#181624ed`. Game blockers use `#282332`. Inputs and transaction details remain on stable dark surfaces. Measured solid/composited text pairs are 8.81–16.54:1; image/gradient combinations are visually reviewed, not certified across all pixels/frames.

## Typography

Local WOFF2 faces: Barlow Condensed 900 (`Display`, `fonts/display.woff2`) for cinematic headings; Space Grotesk 400/700 (`Space`, `fonts/body.woff2`, `body-bold.woff2`) for body and controls. CSS fallbacks are Arial/sans-serif and Impact for display contexts. `font-display: swap`; synthesis disabled. Font licenses are in `docs/licenses/`.

Root text is 16px/1.5. Hero heading is `clamp(52px,6.1vw,88px)` with 1.04 line height; on phones it is `clamp(44px,10vw,62px)`, and 44px at ≤360px. Hero explanation is 17px/1.6, or 15px/1.65 on phones. CTA explanations use 13px desktop/12px mobile. Card explanations are 14px/1.65, game costs 13px desktop/14px mobile. Readiness heading uses Space 700, 26px desktop/23px mobile. Eyebrows use 12px and 1.5px tracking. Financial introductions use 15px/1.7; small panel details and practice result text are 13px. Inputs/selects/textareas remain 16px. Addresses and hashes wrap, and numeric metrics use tabular figures. Precise token formatting stays in `ui.tsx`, outside CSS.

## Layout

The central `.page-body` has a 1400px maximum and 64px desktop side padding; padding decreases at existing 1150/850/640/360 breakpoints to 36/25/20/16px. Major sections use broad spacing (78px desktop; final phone rule 52px). New inset groups use 12–24px padding and 8–24px gaps.

The header's three primary actions remain visible at every tested width. At ≤850px navigation wraps to a second full-width row. On phones the brand, language switch and named wallet icon occupy the first row; owner navigation appears only for the verified owner and wraps. X remains in the footer when its header icon is hidden.

Desktop hero actions form three columns; phone actions form three rows with a button beside its explanatory sentence. Readiness tiles use five columns, three at ≤1150px and two on phones (last tile spans both). How-to steps appear before the first game and stack at ≤850px. Games have three desktop columns, one on phones; costs and both actions are inside each card. Factions use four desktop columns and a two-by-two phone grid. Seasons/challenges use two columns, one at ≤850px. Financial panels lazy-load on demand without blocking practice.

Native dialogs cap width at 540px or 960px (`wide`), fit the viewport with 10–16px gutters and scroll internally. Sticky dialog headings keep close controls available. No horizontal overflow was observed at 1440, 850, 390 or 320px; 200% text resize at desktop also passed. This is not a physical-device or native-browser-zoom claim.

## Elevation & Depth

Dark tonal layers and one-pixel borders organize the functional interface. Game art sits above an opaque content area. Modals use a dark blurred backdrop and large soft shadow. A dark horizontal/bottom hero scrim separates text from the prism. Faction selection adds a colored outline, checkmark and restrained glow. Hover lift and result motion operate only when motion is enabled. Pending transactions do not receive payout celebrations.

## Shapes

Controls use 5–8px radii, inset groups/readiness cards 8–12px and modals 13–18px. Inputs keep visible borders. Icon/media controls are circular; the faceted prism and diamond motifs remain brand elements. The root `--radius` is 16px but existing component-specific radii remain authoritative.

## Components

- `ui.tsx`: `Artwork` takes `name`, `alt`, `loop`, `motion`, `className`; serves local responsive media, lazy-loads below the hero and switches offscreen/hidden/reduced-motion loops to bundled stills. `Dialog` uses native modal semantics, inert background, Escape and focus restoration. `Badge` has labelled muted/cyan/yellow/pink/violet variants. `ExplorerLink` and `DownloadButton` support evidence and explicit backup exports.
- `App.tsx`: first-screen `.hero-paths`, instructional `.how-to` and three `.game-card` patterns. Each game uses `.game-costs`, distinct `.game-actions` and an actionable readiness reason. `PaidRules` shares exact deployed economics.
- `readiness.tsx`: five links to expandable binding/configuration/operator/prize/round details. Loading, stale RPC, contract mismatch, missing settings and absent/expired operator are different states.
- `practice.tsx`: choose → lock/attack → reveal → result, with native keyboard buttons, inline validation and explicit no-token/random labels. Locked choices stay readable. Restart clears the selection. Local badges record completion only.
- `panel-common.tsx`: `ConnectGate`, `TransactionNotice`, `useAction` and `SnapshotNote` give one-operation-at-a-time wallet/network/simulation/receipt/error guidance. Every submitted transaction has an explorer link. No signature request is presented as receipt success.
- `panels.tsx`: exact approvals, swap bounds, staking funding/stream/liability summary, independent withdrawal/claim and allowance revocation. Preserve form labels, explanations and visible errors.
- `rounds.tsx`: real round rules, funded prize and deadlines; enter/commit, reveal, claims/refunds; explicit secret export/import and manual older-round lookup. Payout animation requires a verified matching `Claimed` receipt.
- `setup.tsx` / `round-manager.tsx`: owner-only Phase A/B and two-transaction round management. Correct bindings are skipped; conflicts stop. Inputs stay empty until reviewed. Public question/rules preview and acknowledgement precede owner signatures.
- `season-board.tsx`: dated verified rankings, honest empty/error states, evidence links and informational badges. Local practice and reviewed future-round challenges remain clearly labelled.

Buttons use yellow primary or dark outlined secondary treatment. Main actions are at least 44–48px high; focus has a 3px cyan outline with 4px offset and system-color fallback. Field controls have persistent labels; status/errors use live semantics without moving focus unexpectedly.

Dragon flame, frog bioluminescence, wolf frost and raven lightning combine original three-second WebP loops with brief selection overlays. Actual practice transitions trigger attack/reveal/result effects. Reduced motion and the explicit pause switch stop ambient/transition motion; still imagery and text preserve meaning. Sound is synthesized, muted initially and starts only after explicit opt-in. No external audio/media request is required.

## Do's and Don'ts

- Reuse `.section`, `.sub-panel`, `Dialog`, labelled controls and semantic tokens for another view; use the existing language helpers and verified chain modules.
- Keep free practice and real-PRIO actions distinct. Put costs, maximum loss and the next action beside the relevant game.
- Keep operational detail expandable and mobile navigation visible. Recheck long Turkish labels, 320px reflow and keyboard focus.
- Preserve artwork, logo and bundled stills. New motion needs pause/offscreen/reduced-motion behavior.
- Never invent prizes, activity, deadlines or operator readiness; never count principal as leaderboard winnings.
- Never send unrevealed secrets to an operator or put server credentials in the export. Never celebrate a wallet request as a paid result.

Based on the pinned Better Interface guidance (Jakub Krehel, MIT) and its implemented-design documentation reference (Paul Bakaus, Apache-2.0). Retained notices: `docs/licenses/Better-Interface-LICENSE.txt`.
