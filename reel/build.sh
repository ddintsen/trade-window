#!/bin/bash
# Builds the film. Needs the production build of the web app served on
# :3000 (cd apps/web && npm run build && npx next start -p 3000), ffmpeg,
# Python 3 with numpy, scipy, opencv, Pillow and fonttools (with brotli),
# and Node 22.
#   bash reel/build.sh [stage] [out-dir]
# Stages: fonts, cards, capture, sound, compose, mux, all (default).
# capture is the long one (the 3D scenes render in software WebGL in a
# cloud container: over an hour); the others take minutes, so cards,
# lines, camera and music can change without capturing again.
set -euo pipefail
cd "$(dirname "$0")/.."
STAGE=${1:-all}
OUT=${2:-/tmp/tw-reel}
mkdir -p "$OUT/fonts"

if [[ $STAGE == fonts || $STAGE == all ]]; then
  # The site's own fonts (Handjet and Instrument Sans, both OFL), from the web build.
  python3 - "$OUT/fonts" <<'PY'
import glob, sys
from fontTools.ttLib import TTFont
for f in glob.glob('apps/web/.next/static/media/*.woff2'):
    t = TTFont(f)
    name = t['name'].getDebugName(1).replace(' ', '')
    if 0x41 in t.getBestCmap() and name in ('Handjet', 'InstrumentSans') and '.p.' in f:
        t.flavor = None
        t.save(f"{sys.argv[1]}/{name}.ttf")
PY
fi

if [[ $STAGE == cards || $STAGE == all ]]; then
  node reel/cards.mjs "$OUT" "$OUT/fonts"
fi

if [[ $STAGE == capture || $STAGE == all ]]; then
  node reel/capture.mjs "$OUT/capture"
fi

if [[ $STAGE == sound || $STAGE == all ]]; then
  python3 reel/music.py "$OUT/capture/log.json" "$OUT/music.wav"
fi

if [[ $STAGE == compose || $STAGE == all ]]; then
  python3 reel/compose.py "$OUT/capture" "$OUT" "$OUT/fonts" "$OUT/picture.mp4"
fi

if [[ $STAGE == mux || $STAGE == all ]]; then
  ffmpeg -y -loglevel error -i "$OUT/picture.mp4" -i "$OUT/music.wav" -map 0:v -map 1:a \
    -c:v copy -c:a aac -b:a 256k -movflags +faststart -shortest "$OUT/trade-window-film.mp4"
  cp "$OUT/picture.en.srt" "$OUT/trade-window-film.en.srt"
  cp "$OUT/picture.ru.srt" "$OUT/trade-window-film.ru.srt"
  ffmpeg -y -loglevel error -ss "${POSTER_AT:-12.2}" -i "$OUT/trade-window-film.mp4" -frames:v 1 "$OUT/trade-window-film-poster.png"
  echo "$OUT/trade-window-film.mp4"
fi
