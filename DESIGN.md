# PRISM RIOT design system

## Overview

PRISM RIOT is an illustrated strategy arcade with a real Ethereum economy. Its entry point is the cinematic lobby: a fractured prism and original creatures dominate the scene, while a condensed, oversized headline and yellow arcade action establish hierarchy. Financial controls use calmer opaque workspaces opened from that lobby. Practice and paid play are visibly separate.

The implementation lives in `web/src/App.tsx`, `web/src/style.css`, `web/src/ui.tsx` and the focused `practice`, `panels`, `rounds`, `setup` and `panel-common` modules. Original raster assets are shared runtime inputs, not mockups. The official logo is preserved in `web/public/art/logo.jpg` and used in the header, hero and footer.

## Colors

`web/src/style.css` defines the canonical hex palette. Semantic tokens point to the neutral primitives; faction/illustration colors identify fictional teams rather than financial outcomes.

| Token | Value | Implemented role |
| --- | --- | --- |
| `--bg` → `--violet-950` | `#10101d` | Page, modal and readable hero backplates |
| `--surface` → `--violet-900` | `#181624` | Game cards and subpanels |
| `--surface-raised` → `--violet-850` | `#211e32` | Secondary controls and selected segments |
| `--border` → `--violet-750` | `#393249` | Form/panel structure |
| `--text` → `--gray-100` | `#f8f5ff` | Primary text |
| `--muted` → `--gray-400` | `#b9b3cc` | Supporting copy and metadata |
| `--action` → `--yellow-300` | `#f4f46d` | Primary action fill |
| `--action-text` | `#10101d` | Text on yellow actions |
| `--focus`, `--success` → `--cyan-300` | `#7ce7ff` | Keyboard ring / explicitly labeled confirmed state |
| `--error` | `#ffacb8` | Error text on a dark rose surface |
| `--pink-400` | `#ff76b8` | Brand emphasis and Emberclaw |
| `--purple-300` | `#c1a0ff` | Stormveil and secondary world accents |
| Faction `--faction` / `--card-color` | pink `#ff76b8`, lime `#beef5d`, cyan `#7ce7ff`, violet `#c1a0ff` | Selected faction outline, checkmark and world copy |

Hero functional metadata has an opaque dark backplate; the secondary hero action has a nearly opaque dark backing. Textured artwork never replaces input or transaction surfaces. State always includes text and/or an icon. Solid-token contrast measurements and the remaining image-overlay measurement limitation are recorded in `docs/INTERFACE-REVIEW.md`.

## Typography

Local WOFF2 fonts are in `web/src/fonts/`, with SIL OFL notices in `docs/licenses/`. The browser loads real **Barlow Condensed 900** as `Display` and **Space Grotesk 400/700** as `Space`. CSS falls back to Arial/Impact for the display role and Arial/sans-serif for body text. Font synthesis is disabled; no external font request occurs.

- Display headings use `Display`, weight 900, balanced wrapping and compact line heights around 0.92–1.03. Desktop hero scales through 70–108px, reaches 118px on wide screens, and uses 76px on phones / 65px at the narrowest breakpoint.
- Desktop section headings are 48px, reducing to 40px, 36px and 32px as available width decreases. Game titles are 32px; faction titles respond between 25px and 34px.
- Body root is 16px / 1.5. Hero supporting copy uses 16px / 1.8 on desktop and 12–13px on narrow screens. Financial explanatory copy and metadata use 11–14px in dense modal workspaces. Small decorative category labels were raised to at least 9–10px after rendered review; they are not the only labels on a control.
- Inputs and selects stay 16px to avoid mobile input zoom. Buttons use 12–14px in workspaces; primary mobile arcade controls retain explicit text.
- Eyebrows use uppercase presentation and 1–2px tracking. Addresses remain selectable, wrap with `overflow-wrap`, and link to the explorer. Numeric balances use tabular-number styling.

## Layout

The main content is capped at **1400px**, with desktop inline padding of **64px**, then 36px, 25px, 20px and 16px as width reduces. The hero bleeds to the viewport edges; controls remain inset. Desktop section spacing is 78px, reducing to 57px and 44px. Internal gaps use 8–16px; major component gaps use 22–28px.

- Header: horizontal brand/navigation/wallet layout, 84px high. At 640px it becomes 68px high with a named wallet icon and expandable native-button navigation.
- Games: three equal columns, then one illustrated card per row at 640px.
- Factions: four columns, then a two-by-two grid at 640px. Portrait buttons expose `aria-pressed`; a checkmark, outline and explicit “Your faction” label reinforce selection.
- Economy: two columns on desktop, one column on phones; the live metric console keeps two numeric columns.
- Staking banner: horizontal desktop composition, stacked mobile content/action.
- Dialogs: normal maximum 540px, wide maximum 960px, constrained to viewport minus 20–32px. Their sticky header keeps the close control available. Native `dialog.showModal()` provides modal semantics and inert background; Escape closes, and focus returns to the trigger.
- Responsive breakpoints are 1600, 1150, 850, 640 and 360 CSS pixels. Rendered checks cover 1440, 850, 390 and 320 pixels. Native zoom and physical-device checks are documented as unperformed.

## Elevation & depth

The page combines deep violet tonal surfaces with restrained borders. Game cards use a one-pixel low-opacity outline/shadow and a larger soft black shadow. Hover lift is four pixels only when motion is allowed. Selected factions use their color as an explicit two-pixel outline and a very soft glow. Modals use a dark translucent backdrop with blur and a large shadow; form backgrounds stay opaque. No financial value is rendered directly on a busy scene.

Hero art has a left-to-right dark scrim and a bottom fade. Phone composition moves the scene below the main headline. A slight angled pink ticker divides the cinematic scene from the arcade. Parallax, particles and gentle boss breathing are ambient effects; they never indicate a payment or prize.

## Shapes

Controls use approximately 5–8px radii, game/subpanel cards 10–12px, and modals 13–18px. Header media controls and faction status markers use circles. A small faceted diamond echoes the logo/prism throughout the lobby. Inputs have a visible one-pixel border. Selected/focused states do not depend on shadows alone.

## Components

- **`Artwork` (`ui.tsx`)**: local responsive still images or faction animated WebP. `name`, `alt`, `loop`, `motion` and `className` are its public props. Intersection and document-visibility checks switch offscreen/hidden loops to stills. Images below the hero lazy-load; fixed image dimensions preserve layout.
- **`Dialog` (`ui.tsx`)**: native modal, labeled title, close button, Escape/backdrop close, focus restoration and optional wide layout.
- **`Badge` (`ui.tsx`)**: muted/cyan/yellow/pink/violet labeled statuses. Dot color is supplementary; status text remains authoritative.
- **Buttons**: `.button.primary` is yellow, `.button.secondary` is outlined/tonal, `.text-button` is a labeled secondary action. Disabled, hover, active and keyboard states are implemented. Focus uses a 3px cyan perimeter with 4px offset and system colors in forced-colors mode.
- **`ConnectGate`, `TransactionNotice`, `useAction` (`panel-common.tsx`)**: wallet/network guidance; distinct simulation, wallet confirmation, pending receipt, confirmed and error states; one operation at a time; retained transaction links when confirmation fails. No success effect is triggered merely by requesting a wallet signature.
- **Practice (`practice.tsx`)**: choose/attack/result states with an explicit “Free practice” badge. It never grants PRIO or claims an oracle result. The three arenas use distinct original bosses and artwork.
- **Financial panels (`panels.tsx`)**: labeled fields, bounded approvals, quotes, real balances/funding, transaction history and actionable errors. `.metric-list`, `.sub-panel`, `.info-box`, `.empty-state` and `.rules` are shared patterns.
- **Round cards (`rounds.tsx`)**: round-indexed entry/reveal/claim/refund, private backup export/import and actual oracle evidence. A reward celebration requires a successful matching claim event. Cancellation refund confirmation is informational rather than a prize animation.
- **Owner setup (`setup.tsx`)**: separate Phase A/B segmented views, ordered settings, actual status/calldata, conflict blocks, explicit permanent-binding acknowledgments and owner-reviewed operating forms.

Motion is opt-in through `prefers-reduced-motion: no-preference`, with a visible independent pause control. Reduced mode uses still portraits, removes particles/parallax/breathing/transitions, and makes practice reveals immediate. Offscreen hero particles pause. Optional synthesized sound is muted on load and only responds after the visitor explicitly enables it. No audio asset, streaming service or autoplay audio is required.

## Do’s and don’ts

- Start a new financial flow from the existing modal/panel patterns and source verified chain state through `chain/`. Keep original artwork decorative and outside the transaction critical path.
- Give each new game a distinct illustrated arena and name. Preserve the original supplied logo and local asset manifest.
- Use one primary filled action per task area. Keep secondary actions explicit, keyboard reachable and comfortably spaced.
- Preserve source order on mobile. Test 320px width, full address wrapping, empty balances, RPC errors and missing wallet states.
- Never replace missing live data with zero or invented activity, mix practice scores into the real leaderboard, or celebrate a reward before its confirmed event.
- Never include an unrevealed salt, server key or paid IMD credential in a network status request.
- New motion must have a still/reduced-motion path and pause when offscreen. Keep text readable over every frame with stable dark surfaces.

Design guidance was applied from the pinned Better Interface reference (Jakub Krehel, MIT); this documentation structure follows the included Impeccable reference (Paul Bakaus, Apache-2.0). The retained combined notice is in `docs/licenses/Better-Interface-LICENSE.txt`.
