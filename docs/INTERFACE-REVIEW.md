# PRISM RIOT interface review

Reviewed 2026-10-10 with the pinned Better Interface workflow and the core principles of all six domains. This is worker-produced evidence, not an independent network certification or a security guarantee.

## Scope and environment

Reviewed the actual production export in `dist/`, served at `/preview/`, including the lobby, faction choices, practice game, wallet dialog, swap quote, staking dialog, paid-round readiness and recovery entry points, and the two owner-setup phases. The final reviewed entry script was `assets/index-DbF_2qlm.js`. Dark neon branding and English are intentional supported variants; a light theme and localization were not requested.

The provided browser MCP could not start because `/opt/google/chrome/chrome` was absent. The current Playwright Chrome download also returned HTTP 403. A permitted foreground fallback used official Playwright Chromium 136.0.7103.25 from Microsoft's public distribution, with temporary Debian libraries and font configuration under `/tmp`. No system configuration, credentials, or protected repository paths were changed. The verification script starts and closes both the preview server and browser within one command.

## Six-domain coverage

| Domain | Coverage | Evidence and limits |
| --- | --- | --- |
| Accessibility | Checked | Native buttons, links, labels and dialog; visible keyboard skip-link focus; dialog Tab traversal did not reach background controls; Escape closed the dialog and restored the practice trigger; icon-only mobile wallet has an accessible name; 16px mobile form inputs; static motion alternatives. Axe WCAG 2 A/AA, 2.1 AA and 2.2 AA scan returned zero violations. Image-backed contrast remained an automated incomplete result. No screen-reader session or physical assistive-technology test was performed. |
| Layout | Checked | Rendered at 1440×1000, 850×1000, 390×844 and 320×844. Each document's scroll width equalled its viewport width. Navigation, cards, modal controls, complete owner address wrapping and visible action placement were inspected. Native 200% browser zoom, RTL and translated text were not tested. |
| Writing | Checked | Practice is explicitly local and awards no PRIO; current paid readiness, maximum loss, gas, zero reward funding and no fixed APY are visible. Missing wallet and failed RPC states give recovery guidance. Owner preparation is explicitly distinct from execution. Existing approvals are not falsely described as reverted after a declined wallet request. |
| Typography | Checked | Loaded local Display and Space faces were confirmed in the browser. Display hierarchy remains distinct from body text and numeric controls. Input text is 16px at mobile. Undersized 6–8px metadata was raised to 10px; long labels wrap. Native operating-system font rendering and all possible text enlargement settings were not tested. |
| Colors | Checked, bounded | Measured the solid foreground/background pairs below. Added opaque dark backgrounds behind mobile hero proof labels and the secondary action where bright art reduced readability. Other image/gradient backgrounds were visually inspected but not exhaustively sampled over every animation frame; the review does not assert universal contrast compliance. |
| UI details and motion | Checked | Distinct illustrated hero, four faction portraits/environments and three arena/boss illustrations share the supplied logo's neon identity. All four faction raster loops produced differing frames while visible, changed to still images when paused/offscreen, and reduced-motion mode had zero running CSS animations. Faction selection, attack/reveal and practice restart have textual state cues. Sound is off by default. Audio perception, background-tab CPU profiling and DevTools motion playback at 10% speed were not tested. |

## Findings corrected and rechecked

| Severity | Source | Finding and correction | Recheck |
| --- | --- | --- | --- |
| High | `web/src/App.tsx:214` | The mobile header hid the wallet button's text, leaving its icon without a name. Added a stable accessible label, including the connected wallet when present. | No visible unnamed buttons at all four widths; mobile wallet action opened correctly. |
| Medium | `web/src/style.css:390` | Hero proof labels and the secondary action crossed bright mobile artwork and became difficult to read. Added dark backgrounds and retained the bright artwork behind the group. | Final mobile screenshot inspected; proof text now uses the measured muted-on-background pair. |
| Medium | `web/src/style.css:1997` | Faction and other metadata dropped to 6–8px at narrower widths. Raised small metadata to 10px and permitted wrapping. | Final 320px/390px/850px layouts had no horizontal overflow; faction names and realm labels remained visible. |
| Low | `web/src/style.css:1` | Initial font assets used TTF and were duplicated in the public export. Switched to local WOFF2 source assets. | All three final faces reported `loaded`; no font HTTP failure. |
| Test correction | `web/scripts/browser-check.mjs` | An initial dialog assertion treated native browser-chrome/body focus as a background control, then left the modal open and caused dependent checks to fail. The assertion now rejects actual background controls, closes the dialog and verifies focus return. | Final dialog check passed; subsequent panels opened normally. |
| Test correction | `web/scripts/browser-check.mjs` | Initial full-page screenshots preceded lazy image loading and retained the skip-link focus overlay. Warmed the sections before capture and kept keyboard-focus evidence separate. | Final screenshots contain complete faction artwork and unobscured branding. |

## Measured contrast

Computed from the named solid CSS colors that render the identified surfaces. These ratios do not describe unrelated image overlays.

| Pair | Foreground | Background | Ratio |
| --- | --- | --- | --- |
| Body text | `#f8f5ff` | `#10101d` | 17.50:1 |
| Muted text / hero proof | `#b9b3cc` | `#10101d` | 9.32:1 |
| Muted surface text | `#b9b3cc` | `#181624` | 8.81:1 |
| Primary action | `#10101d` | `#f4f46d` | 16.17:1 |
| Focus ring on page | `#7ce7ff` | `#10101d` | 13.23:1 |

## Actual verification

Command executed from the repository root:

```sh
FONTCONFIG_FILE=/tmp/prism-review-fonts.conf \
LD_LIBRARY_PATH=/tmp/prism-review-system/usr/lib/x86_64-linux-gnu \
PRISM_REVIEW_CHROMIUM=/tmp/prism-review-browsers/chrome-linux/headless_shell \
/home/debian/.nvm/versions/node/v24.21.0/bin/node web/scripts/browser-check.mjs
```

Result: exit 0, **21 checks passed, 0 failed**. On a normal machine with Playwright's browser dependencies installed, run `cd web && npm run test:browser`; the temporary worker overrides are not application requirements.

Verified interactions: mobile menu navigation; faction selection; four visible animated raster loops and still fallbacks; global pause and reduced motion; missing wallet error; practice choice/reveal/scoring/restart; keyboard dialog focus and return; paid-round readiness; read-only Phase A transaction ordering; Phase B owner view; swap input labels and a real read-only quote; staking zero-funding state; mocked wallet connection, Base-to-Ethereum switch and rejection; failed RPC recovery without invented zero balances.

The live quote at Ethereum block **26160354** simulated 0.0001 ETH to 9,810.03469976 PRIO, with a 9,760.98452626 PRIO minimum at 0.5% slippage. It displayed the 1.25% LP fee, currently 0% protocol fee, immutable extra 0.5% ETH-leg hook fee, and zero website fee. This was an `eth_call` simulation, not an executed swap. Live state showed zero rounds, zero funded game prizes, zero staking funding and incomplete owner configuration. These observations can change after that block.

The mock provider used the verified project-owner address only inside the test. Its recorded methods were `eth_requestAccounts`, `eth_chainId`, `wallet_switchEthereumChain`, and a rejected `eth_requestAccounts`; no signing or transaction method was invoked. Phase B confirmation remained disabled without reviewed values. No wallet signature or transaction was broadcast by this review. Paid entry, reveal, claim and refund settlement could not be exercised against live rounds because none existed; their implementation/security tests are recorded separately by the main validation report.

The final browser run reported zero page errors, zero console errors and zero HTTP error responses. Nine image requests were intentionally aborted during changing `src`/`srcset` as loop visibility changed; successful final images were decoded and captured. Browser findings are recorded in `docs/browser-results.json` and `artifacts/browser/review-results.json`.

## Visual evidence

Repository copies total 307,117 bytes:

- `docs/screenshots/hero-desktop.jpg` — final 1440px desktop hero and controls.
- `docs/screenshots/hero-mobile.jpg` — final 390px mobile hero, backgrounds and controls.
- `docs/screenshots/factions-mobile.jpg` — four distinct portraits, selected frog faction and readable labels.
- `docs/screenshots/practice-mobile.jpg` — game-specific boss, revealed choice and explicit no-token result.

Full-page 1440/850/390/320 screenshots, keyboard focus, wallet failure, owner setup, mocked Phase B, paid-round readiness, live quote and RPC failure are additionally under `artifacts/browser/` for the artifact uploader.

## Completion

Complete for the stated browser/interface-review scope, subject to the explicit unperformed checks above. Publication and GitHub delivery are separate and recorded in `docs/PUBLICATION.md`. This review does not certify security, future RPC availability, owner configuration, or server-operator readiness.
