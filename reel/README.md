# The film

Trade Window's film, 76 s: a short story on cards (you meet a trader; who sends first? nobody does), a cut into the real site on its own headline, a trade with the gnome trader in a practice room where pointing at each item shows what it is, a named price, three closing lines and the call. 1920 × 1080, 30 fps, H.264 with AAC, English on screen with English and Russian SRT. The script is `docs/reel/SCRIPT.md`, the references and the directing method `docs/reel/REFERENCES.md`.

| File | What it does |
| --- | --- |
| `cards.html`, `cards.mjs` | The cards in the site's type, colours and pieces (slots with the real item icons, the How it works panes, the mark), rendered frame by frame: the opening (0–10 s) and the closing (63.33 s to the end). The headline is set exactly where the home page draws it, so the cut matches; the script prints the check |
| `capture.mjs` | Drives the production build with Playwright at 1440 × 810 and 2×, under a fake clock: the home page with its scene, the rules and the Lock function, then a practice trade and a named price. Every timer, the trader's moves and every frame of the 3D scenes happen at film time. Lines and cuts are synced to the score's bars; steps that run long are reported. Writes `raw.mkv` and `log.json` |
| `compose.py` | Joins the parts: cards, then a matched dissolve into the framed site (a camera easing to each action, at most 1.5×; a drawn pointer with a ring per press; one line at a time under the screen, its words rising into place), then a zoom through into the closing cards. Writes the film and its SRT files; `STILLS="9.7,23.5"` saves stills instead, for a quick look |
| `music.py` | The score, 96 BPM, cut to the film's bars: a heartbeat under the story in B minor, a stop and a swell into the site, a warm groove in D major that falls away while the trader changes his offer, pad and piano for the closing lines, a held chord. Taps for presses and keys, a swell on each settlement. −16 LUFS integrated, true peak below −1.5 dBTP, low-passed at 8 kHz. Nothing sampled or licensed |
| `measure.mjs` | One-off: measures the home headline and saves the item icons into `cards/` |
| `build.sh` | fonts, cards, capture, sound, compose, mux |

## Build

```sh
cd apps/web && npm run build && npx next start -p 3000 &   # the production build
bash reel/build.sh all /tmp/tw-reel
DRY=1 SNAP=1 node reel/capture.mjs /tmp/tw-dry              # a quick walk through every step: timing and a still per step
```

In the cloud container the capture takes over an hour (software WebGL on two cores); with a GPU, drop the swiftshader flags in `capture.mjs`. Cards, lines, camera and music change in minutes: edit and rerun `cards`, `sound`, `compose` and `mux`.

## Changing it

- **Story and cards**: `cards.html` (words, layout, timing in `render`). Keep the headline identical to the home page's.
- **Steps, lines and timing on the site**: `capture.mjs`, the part under "the film". `line(text, until)` puts a line under the screen; `sync(at)` holds until a film time on the bar grid. Lines are logged by the capture, so to change words without capturing again, edit them in `log.json` as well and rerun compose.
- **Music**: `music.py`: the bar grid in `bar_starts`, chords in `STORY`, `GROOVE`, `TRUST`, sections in `section`.
- **After the app changes**: recapture. The film shows practice rooms, so it needs no chain.

## The forest backdrop

`apps/web/public/scenes/forest-night.webp` is a still of the trade window's night forest without the bridge or the traders, used behind every page that has no scene of its own. `reel/forest-still.ts` draws it with the site's own `createForest` and lighting: bundle it with esbuild (`--alias:three=apps/web/node_modules/three`), open it in a page with `?w=2400&h=1350`, and save the canvas.
