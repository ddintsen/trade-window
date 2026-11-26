# Design direction: glass panes at night

October 2026. Owner direction: rebuild Trade Window on chain, in the same family as «67» (dark theme, glass cubes, a logo built from cubes, a night voxel forest in the spirit of the Gno.land docs world, reworked in our own style), and make the service complete, beautiful and convenient. The previous Supabase-like green-on-black UI is retired.

## Idea

A trade window is a pane of glass between two people. Each puts their cubes on their own side, the room keeps count of every change, and nothing passes through until both have locked the same count. Then everything crosses at once.

Recognisable from one screenshot: two glass panes, warm and cool, the version number between them, and the lamps that show who has locked it.

## Sources

| Source | What it gives | What we change | Not copied |
| --- | --- | --- | --- |
| «67» V6 (owner's approved sibling) | Night ground, tone-only surfaces, flint primary action, glass cubes, cube mark, voxel forest scene, Instrument Sans in two widths | Two new glass colours for the two sides; the object is a window, not a balance | The 6/7 mark, emerald/cobalt Yes/No colours, the balance |
| docs.gno.land hero (screenshot 2026-10-12) | Voxel pines and rounded voxel bushes on deep green, soft matte light | Night instead of day; a clearing around a glass window | The pond, lily pads, gnome, Gno.land logo (no trademark rights) |
| Renzo Piano, Maison Hermès Ginza (glass-block façade at night) | Light from inside glass blocks; the block is the pixel | Each pane is a small wall of lit glass blocks | Façade proportions |
| Larry Bell, coated glass cubes | Two tints in one transparent volume | Amber and aqua glass, each owned by one side | The coatings, the gallery plinths |

## Palette (tokens in `apps/web/src/app/globals.css`)

| Role | Token | Value | Contrast |
| --- | --- | --- | --- |
| Ground | `--ground` | #0B0E0D | ink 16.5:1, muted 7.7:1 |
| Surfaces by tone, no outlines | `--surface`, `--control`, `--field` | #121715, #1A201E, #1C2321 | muted ≥ 6.6:1 |
| Text | `--ink`, `--muted` | #E8EEEB, #9AA6A1 | |
| Maker side, amber glass | `--maker`, `--maker-fill`, `--maker-bg` | #F2B35C, #9A5E1C, #22190E | 10.5:1 on ground, 9.4:1 on its pane |
| Taker side, aqua glass | `--taker`, `--taker-fill`, `--taker-bg` | #74D3DA, #1E7880, #0E1E20 | 11.1:1 on ground, 9.9:1 on its pane |
| Primary action | `--act` | #8FDC78 with #0B0E0D text (hover #A8E995); chosen by the owner on 14 October so the one action reads at once | 11.9:1 |
| Settled light, focus ring | `--flint` | #E8EEEB with #0B0E0D text | 16.5:1 |
| Practice venue | `--frost` | #CDD6D2 | 13.1:1 |
| Refusal | `--alert`, `--alert-bg` | #F28B95 on #2E1519 | 7.2:1 |

Colour follows the role in the room, not the viewer: the maker's side is amber on both parties' screens, so "the amber side" means the same thing to both. "You" is written on your side.

## Type

Instrument Sans (OFL, Google Fonts) in two widths: condensed (wdth 75) for display lines on editorial pages, regular for everything operational, tabular figures for exact amounts. Handjet (OFL), as in 67 (weight 640, axes ELSH 2 and ELGR 1), for the trade window's game type: the page title, panel titles in their side's colour, nameplates over the traders, the version figure and the stack counts in item slots. JetBrains Mono (OFL) for addresses, realm paths and function names only. Sentence case everywhere.

## Mark

Two 2×3 panes of glass cubes, amber and aqua, with an empty column between them. Each pane holds one cube of the other colour on its inner edge, diagonally opposite: the swap has happened. Header and footer only. Source: `docs/design/mark.svg`, component `apps/web/src/components/brand/mark.tsx`.

## Scenes

- Home: headline and actions on the left; on the right the mark stands in a night voxel clearing as two panes of lit glass blocks. The one orchestrated moment: the amber lamp lights, the aqua lamp lights, the two inner cubes cross through the gap, the clearing flashes flint. Then a dense section with the real rules, a calm one with live board listings, one dark code block with the `Lock` function.
- Trade window (October 12, owner: "not full screen, but a game interface, the way 67 does it; both the interface and beauty"): a band of the night forest runs edge to edge and dissolves into the page (CSS mask), not a full screen. On wide screens the title rides over its calm top and the three panels overlap its lower fade; below 1024 px the band sits between the title and the panels. In the band: a plank bridge over a pond with a booth in the middle (the window, its sign the version), each trader's gnome on its shore with a Handjet nameplate, each offer laid out on its half on a blanket in the side's colour, a few cherries in bloom, mist on the water. A side that is ready lights its lantern and its blanket glows. Under it the window, laid out the way an MMO lays out its trade window (owner's pick on 15 October, of three variants): your bag and theirs side by side, eight slots each, and the trade bar across the bottom, docked in view on wide screens. The bar leads with what the room waits for in Handjet ("Your turn", "They are ready", "Their price"), the version in one plain line under it with what it means, and the one action on the right. Item details (exact amount, what arrives after the fee, verified or not, full path) live in the tooltip and the confirmation. Bags, bar and dialogs are game slabs (see "Game interface" below); one green main key.
- Items: a native coin is a stack of coins with its logo, a token a crate with its logo or symbol, wrapped GNOT a crate with the coin on its front, an NFT its picture in a brass frame on a stand with its number on a plate. Piles grow with the amount (one piece, a stack, two stacks, a heap). A slot shows a stack count in its corner, shortened and rounded down (500K, 1.2M); the exact amount is in the tooltip, the item's accessible name and the confirmation. NFTs show their number instead of a count.
- Board, lobby, contract: plain operational lists. No cards grid, no KPI tiles.

## Motion

Feedback 150–250 ms with `cubic-bezier(0.23, 1, 0.32, 1)`. Lamps fade over 400 ms. The home scene plays once on load, then every 9 s while visible, pauses offscreen and in hidden tabs; reduced motion draws one still frame. The trade scene's own moments (items arriving, leaving in red, crossing the bridge) always play; the forest's life (wind, petals, fireflies, mist) runs in passes of five seconds, as 67's scenes do: on arrival, back in view, while the pointer moves over it and when the trade changes, slowing to a stop in the last second (WCAG 2.2.2), at most 30 frames a second, and it stops for good on a device that cannot keep up. Without a graphics card (software rendering) the window goes without the scene. The version figure ticks in from below when it changes.

## Game interface

October 15, owner: "нам надо все под такой стиль игровой сделать" (everything in this game style), then "чтобы экран пустым не был, на фон можешь какую-то сцену кидать, чисто лес" (so no screen is empty, put a scene behind, just the forest). The whole site is built from the voxel world's own parts:

- **Blocks with stepped corners.** Every panel, key, slot and field has two pixel steps cut from each corner (`.notch`, `.notch-lg` in `globals.css`), the edge of a voxel. No rounded corners.
- **Slabs.** Panels are lit from above: a light top edge, a darker base, tone only, never an outline or a cast shadow (`.slab`).
- **Wells.** Slots and fields are cut into the slab: dark inside, shaded at the top (`.well`).
- **Keys.** Every action is a key: a block on a darker base, its label in Handjet, pressing down when pressed (`.key`, `components/ui/button.tsx`). Nothing that acts looks like a link; links stay inside running text only.
- **Type.** Handjet for headings, navigation, keys, figures and labels that name things; Instrument Sans for reading.
- **The forest behind.** Pages without a scene of their own sit on a still of the night forest, rendered from the same world without the bridge or the traders and darkened toward the bottom (`public/scenes/forest-night.webp`, `components/site/backdrop.tsx`).

## Rules carried over from the owner

No borders, outlines or frames; separation by tone (the game slabs' bevels are tone inside the block). No eyebrows, decorative numbers, dots or badges; no `A · B · C` strings. No invented figures: every number on screen is read from the chain or labelled as practice.
