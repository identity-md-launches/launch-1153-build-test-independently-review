# PRISM RIOT artwork

The finished runtime set is in `web/public/art/`. It contains eight separately commissioned original illustrations, eight responsive still variants, four three-second animated WebP loops, the unchanged official logo, two derived app icons and a social preview. The complete set is **1,853,755 bytes**. [ASSETS.json](ASSETS.json) records dimensions, SHA-256 hashes, provenance, rights notes and animation fallbacks for every file.

## Art direction

The supplied official logo is the identity reference: an angular spectrum prism with magenta dragon, lime/cyan frog, ice-blue wolf and violet raven. The new universe extends those creatures into richly illustrated environments: a volcanic citadel, luminous lagoon, frozen den and storm tower. Painterly texture, strong silhouettes, crystalline materials, saturated light and near-black atmosphere connect the assets without repeating a generic card background.

The cinematic hero features a fractured floating prism and the four environments. The games have distinct arenas and bosses: **Gilded Maw**, an articulated gold/obsidian vault guardian; **Mirror Jackal**, a reflection sentinel overlooking a faction duel; and **Null Crown**, a spectral prism titan confronted by four cooperating factions. These are visual worldbuilding names, not claims about deployed contract rules or active rounds.

## Creation and rights

All eight scene/portrait assets were created with the available **built-in `image_gen` tool**, one call per distinct artwork. No paid external job, stock image service, additional provider subscription or CLI API key was used. The official logo was downloaded directly from the exact requester-provided URL and retained unchanged as `logo.jpg` (400 × 400).

Generated illustrations were commissioned for this project under the generation service's terms. No exclusive copyright or trademark right is asserted. The supplied logo remains the property of its rights holder; the assignment directed its use, and no separate logo license was supplied. The asset manifest distinguishes these origins. Large generator PNG intermediates are not runtime dependencies and are omitted from the submission to satisfy the bundle budget.

## Runtime assets

| Use | Main asset | Responsive variant or fallback |
| --- | --- | --- |
| Cinematic universe | `art/hero.webp` (1440 × 810) | `art/hero-sm.webp` |
| Dragon faction | `art/dragon-loop.webp` | `art/dragon.webp`, `art/dragon-sm.webp` |
| Frog faction | `art/frog-loop.webp` | `art/frog.webp`, `art/frog-sm.webp` |
| Wolf faction | `art/wolf-loop.webp` | `art/wolf.webp`, `art/wolf-sm.webp` |
| Raven faction | `art/raven-loop.webp` | `art/raven.webp`, `art/raven-sm.webp` |
| Vault Raid | `art/raid.webp` | `art/raid-sm.webp` |
| Faction Duel | `art/duel.webp` | `art/duel-sm.webp` |
| Cooperative Boss | `art/boss.webp` | `art/boss-sm.webp` |
| Official identity | `art/logo.jpg` | `art/favicon.png`, `art/apple-touch-icon.png` |
| Social preview | `art/social.webp` | Logo combined with hero |

Faction stills are 576 × 576; animated versions are 384 × 384. Game stills are 899 × 506 (preserving the generated aspect ratio). Paths in the table are relative to the exported site root. Assets are served locally; the website needs no runtime image provider.

## Motion

Each faction loop contains 24 frames at 125 ms per frame, loops every three seconds and uses its generated illustration as a stationary base. Authored atmospheric layers add flame filaments and rising embers, bioluminescent spores and lagoon ripples, drifting frost and breath, or slowly pulsing lightning and sparks. These are completed animated WebP files, not empty animation placeholders. The four source portraits remain their explicit still-image fallbacks.

The lightning swells once per three seconds; there is no rapid strobe. The frontend should swap loops to stills when offscreen or when reduced motion is requested and should keep decorative motion independent of wallet and transaction readiness. Atmospheric loops are world ambience, not prize signals. A celebration must wait for a confirmed outcome in application state.

## Generation prompt set

Every generation call used the official logo as an **identity reference only**, requested original high-quality painterly arcade fantasy key art, and prohibited text, letters, UI, borders and watermarks. The shared material vocabulary was sharp fantasy silhouettes, tactile brushwork, faceted prism gems and saturated pink/cyan/yellow/violet light in a deep obsidian world. The following are the delivered scene specifications, with the per-asset composition and subjects preserved from the prompts.

1. **Hero, 16:9:** A gigantic fractured floating prism at right-center sends bright cyan, pink, yellow and violet rays through obsidian ruins above a glowing abyss. The panorama hints at a dragon citadel, frog lagoon, icy wolf den and lightning tower. Four tiny faction silhouettes occupy distant architectural platforms. Use dynamic cinematic depth and dark atmospheric space at left for a UI heading.
2. **Dragon, square:** A ferocious obsidian-scaled dragon with neon-magenta scales and gold eyes, three-quarter head and chest in a ruined volcanic citadel. Open jaws breathe hot-pink flame with a golden core toward lower left; wing arcs frame the subject. Deep crimson/purple castle silhouettes, embers and lit obsidian steps. Prominent horns and long snout; face in upper half, flame in lower third.
3. **Frog, square:** A regal bioluminescent tree-frog guardian perched on a luminous lily pad in a mysterious neon lagoon. Enormous glassy golden-lime eyes, natural squat silhouette and luminous cyan markings on emerald skin. Moonlit lagoon, lime spores, glowing cyan mushrooms, hanging vines and ripples. Curious, clever and slightly mischievous; face in upper half, lagoon below.
4. **Wolf, square:** A fierce arctic wolf with long silver-white and charcoal fur, bright cyan eyes and angular translucent ice-crystal armor. An ancient ice den, cold blue auroras and drifting frost surround it. Pale cyan breath crosses lower left; textured snow-dusted fur. Three-quarter head and chest portrait in upper half; silver, icy cyan, midnight blue and violet palette.
5. **Raven, square:** A proud dark raven storm guardian with angular iridescent indigo feathers, an unmistakable long black beak and glowing violet eyes. Perched on a broken storm tower with branching violet lightning and golden electricity by a wingtip. Strong silhouette and purple edge lighting; face in upper half, tower below.
6. **Vault Raid, 16:9:** Gilded Maw, a colossal obsidian-and-gold crab-like automaton guarding a luminous prism vault. Six articulated gold legs, a pink crystal shell core and snapping asymmetric pincers, seen at low angle. Vast concentric vault doors, floating treasure shards, pink beams and gold dust. A tiny dragon-faction adventurer supplies scale; strong boss silhouette at center-right.
7. **Faction Duel, 16:9:** Dragon knight with a serrated pink crystal blade confronts a frog duelist with cyan crescent spear across a broken circular arena floating above a neon lagoon. Between them, Mirror Jackal rises from a fractured reflection portal: an angular glass-and-black guardian with twin colored eyes, erect ears and snarling muzzle. Pink flames divide one side from cyan/lime reeds on the other, with a violet abyss below.
8. **Cooperative Boss, 16:9:** Null Crown dominates a floating storm arena: a spectral armored titan with a hollow ring crown, four orbiting prism shards, a cracked yellow-white chest core and ultraviolet lightning tendrils. Dragon warrior, frog mage, ice wolf and raven face the immense boss together from fractured foreground platforms. Low angle, violent cyan/violet clouds, pink highlights and gold debris.

## Asset checks performed

- Downloaded the logo successfully with `curl -L --fail --max-time 30`; inspected its 400 × 400 design.
- Inspected a contact sheet of all eight generated artworks, then inspected the dragon and wolf portraits at their exported size to place atmospheric motion correctly. Subjects, silhouettes, arenas and color identities are distinct.
- Exported optimized WebP stills and responsive variants with Pillow in an isolated `/tmp` environment. Generated source artwork was retained; processing resized, compressed and packaged the final assets.
- Opened every delivered asset with Pillow. Verified the four animation files each have 24 frames, 384 × 384 dimensions and a nonzero pixel difference between frames 0 and 12. Verified total runtime art is 1,853,755 bytes.
- Generated SHA-256 hashes for every final asset in the manifest. These are artifact integrity checks, not an independent legal or visual certification.

Rendered mobile/desktop integration, reduced-motion switching, offscreen pausing, contrast, image loading and transaction-related animation behavior are frontend review responsibilities and are recorded with the site's overall validation results.
