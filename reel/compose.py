#!/usr/bin/env python3
"""Composes the film from its three parts: the opening cards, the captured
site, the closing cards (docs/reel/SCRIPT.md).

The site plays in a framed screen on the night ground; a camera eases
between the parts each step is about (at most 1.5x, so close-ups stay
sharp); a drawn pointer follows the real one, with a soft ring on every
press; one line at a time sits under the screen, its words rising into
place, never over the action. The cards dissolve into the home page on a
matched headline, and the site zooms through into the closing cards.

    python3 reel/compose.py <capture-dir> <cards-dir> <fonts-dir> <out.mp4>
"""
import json
import math
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

cap_dir, cards_dir, font_dir, out_path = sys.argv[1:5]
log = json.load(open(f'{cap_dir}/log.json'))
FPS = log['fps']
VW, VH = log['view']['width'], log['view']['height']
DPR = log['dpr']
SW, SH = VW * DPR, VH * DPR
N = log['frames_total']
T0 = log['t0']
W, H = 1920, 1080
FILM_END = 76.25
NF = math.ceil(FILM_END * FPS)
HOOK_FRAMES = 300            # cards: 0 to 10 s
OUTRO_FROM = 1900            # cards again from 63.33 s
UI_FROM = round(T0 * FPS)    # the site's first frame in the film
DISSOLVE = 0.6               # cards into the home page, on the matched headline
ZOOM = 0.4                   # the site into the closing cards
# The screen: 16:9, a margin on three sides, the line band below it.
SX, SY, SCW, SCH = 176, 40, 1568, 882
RADIUS = 22
AXIS = 272                   # the site's own left edge inside the screen: lines and cards share it

GROUND = (11, 14, 13)
INK = (232, 238, 235)


def font(name, size, axes):
    f = ImageFont.truetype(f'{font_dir}/{name}', size)
    f.set_variation_by_axes(axes)
    return f


line_font = font('Handjet.ttf', 64, [640, 1, 2])
LINE_TOP, LINE_H = 944, 92


def clamp(u):
    return min(1.0, max(0.0, u))


def out_cubic(u):
    return 1 - (1 - clamp(u)) ** 3


def out_quart(u):
    return 1 - (1 - clamp(u)) ** 4


def in_out(u):
    u = clamp(u)
    return 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2


# ------------------------------------------------------------------ camera (capture time u)
MIN_W = 960


def fit(box):
    if box is None:
        return (0.0, 0.0, float(VW), float(VH))
    cx, cy = box['x'] + box['w'] / 2, box['y'] + box['h'] / 2
    w = max(box['w'], box['h'] * 16 / 9, MIN_W)
    w = min(w, VW)
    h = w * 9 / 16
    if h > VH:
        h, w = VH, VH * 16 / 9
    x = min(max(cx - w / 2, 0), VW - w)
    y = min(max(cy - h / 2, 0), VH - h)
    return (x, y, w, h)


MOVE = 0.95
moves = [(f['at'], fit(f['box'])) for f in log['focus']]
_starts = {}


def camera_at_start(i):
    if i in _starts:
        return _starts[i]
    if i == 0:
        r = fit(None)
    else:
        prev_at, prev_target = moves[i - 1]
        prev_start = camera_at_start(i - 1)
        u = in_out((moves[i][0] - prev_at) / MOVE)
        r = tuple(a + (b - a) * u for a, b in zip(prev_start, prev_target))
    _starts[i] = r
    return r


def camera(u):
    current = fit(None)
    for i, (at, target) in enumerate(moves):
        if u < at:
            break
        start = camera_at_start(i)
        k = in_out((u - at) / MOVE)
        current = tuple(a + (b - a) * k for a, b in zip(start, target))
    return current


# ------------------------------------------------------------------ pointer
def arrow(scale=1.0):
    """A plain arrow pointer, drawn at 4x and reduced for clean edges."""
    s = 4
    pts = [(0, 0), (0, 25), (6.2, 19.4), (10.4, 28.6), (14.2, 27), (10.1, 18), (18, 18)]
    pts = [(x * scale * s + 4 * s, y * scale * s + 4 * s) for x, y in pts]
    size = int(36 * scale * s)
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(pts, fill=(11, 14, 13, 255))
    cx = sum(x for x, _ in pts) / len(pts)
    cy = sum(y for _, y in pts) / len(pts)
    d.polygon([(cx + (x - cx) * 0.78, cy + (y - cy) * 0.80) for x, y in pts], fill=(245, 248, 246, 255))
    return im.resize((size // s, size // s), Image.LANCZOS)


POINTER = arrow(1.3)
POINTER_DOWN = POINTER.resize((int(POINTER.width * 0.92), int(POINTER.height * 0.92)), Image.LANCZOS)
POINTER_TIP = (4, 4)

# ------------------------------------------------------------------ lines (film time)
FADE = 0.25
captions = sorted(({'at': c['at'] + T0, 'until': c['until'] + T0, 'text': c['text']} for c in log['captions']), key=lambda c: c['at'])
for i, c in enumerate(captions):
    if i + 1 < len(captions):
        # A line has faded out before the next one rises in the same place.
        c['until'] = min(c['until'], captions[i + 1]['at'] - FADE - 0.05)
    words, x = [], AXIS
    for w in c['text'].split(' '):
        words.append((x, w))
        x += line_font.getlength(w + ' ')
    c['words'] = words


def draw_lines(pil, t):
    for c in captions:
        if not (c['at'] - 0.01 <= t <= c['until'] + FADE):
            continue
        fade = 1 - clamp((t - c['until']) / FADE)
        layer = Image.new('L', (W, LINE_H), 0)
        d = ImageDraw.Draw(layer)
        for k, (x, w) in enumerate(c['words']):
            u = out_quart((t - c['at'] - k * 0.045) / 0.55)
            if u <= 0:
                continue
            d.text((x, 6 + (1 - u) * LINE_H), w, font=line_font, fill=255)
        if fade < 1:
            layer = layer.point(lambda v: int(v * fade))
        ink = Image.new('RGB', (W, LINE_H), INK)
        pil.paste(ink, (0, LINE_TOP), layer)


# ------------------------------------------------------------------ the framed site
mask = np.zeros((SCH, SCW), np.uint8)
cv2.rectangle(mask, (RADIUS, 0), (SCW - RADIUS, SCH), 255, -1)
cv2.rectangle(mask, (0, RADIUS), (SCW, SCH - RADIUS), 255, -1)
for cx, cy in ((RADIUS, RADIUS), (SCW - RADIUS - 1, RADIUS), (RADIUS, SCH - RADIUS - 1), (SCW - RADIUS - 1, SCH - RADIUS - 1)):
    cv2.circle(mask, (cx, cy), RADIUS, 255, -1, lineType=cv2.LINE_AA)
mask = cv2.GaussianBlur(mask, (3, 3), 0).astype(np.float32)[..., None] / 255.0
ground = np.zeros((H, W, 3), np.uint8)
ground[:] = GROUND
clicks = log['clicks']
pointer_alpha = 0.0


def site_frame(src, j, t):
    """Frame j of the capture (capture time u = j / FPS), at film time t."""
    global pointer_alpha
    u = j / FPS
    x, y, w, h = camera(u)
    crop = src[int(round(y * DPR)):int(round((y + h) * DPR)), int(round(x * DPR)):int(round((x + w) * DPR))]
    screen = cv2.resize(crop, (SCW, SCH), interpolation=cv2.INTER_AREA)
    img = ground.copy()
    region = img[SY:SY + SCH, SX:SX + SCW].astype(np.float32)
    img[SY:SY + SCH, SX:SX + SCW] = (screen * mask + region * (1 - mask)).astype(np.uint8)
    pil = Image.fromarray(img)

    px, py, shown, down = log['frames'][j]
    pointer_alpha += ((1.0 if shown else 0.0) - pointer_alpha) * 0.25
    if pointer_alpha > 0.02:
        sx = SX + (px - x) / w * SCW
        sy = SY + (py - y) / h * SCH
        if SX - 20 < sx < SX + SCW and SY - 20 < sy < SY + SCH:
            for c in clicks:
                k = (u - c) / 0.42
                if 0 <= k <= 1:
                    r = 8 + 26 * out_cubic(k)
                    ring = Image.new('RGBA', (W, H), (0, 0, 0, 0))
                    ImageDraw.Draw(ring).ellipse((sx - r, sy - r, sx + r, sy + r), outline=(232, 238, 235, int(150 * (1 - k))), width=3)
                    pil.paste(ring, (0, 0), ring)
            p = POINTER_DOWN if down else POINTER
            if pointer_alpha < 0.98:
                p = p.copy()
                p.putalpha(p.getchannel('A').point(lambda v: int(v * pointer_alpha)))
            pil.paste(p, (int(sx - POINTER_TIP[0]), int(sy - POINTER_TIP[1])), p)
    draw_lines(pil, t)
    return np.asarray(pil, np.uint8)


def scaled(img, s, blur=0.0):
    m = cv2.getRotationMatrix2D((W / 2, H / 2), 0, s)
    out = cv2.warpAffine(img, m, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=GROUND)
    if blur > 0.3:
        k = int(blur * 3) | 1
        out = cv2.GaussianBlur(out, (k, k), blur)
    return out


# ------------------------------------------------------------------ frames
def reader(path, w, h):
    return subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE), w * h * 3, (h, w)


class Stream:
    def __init__(self, path, w, h):
        self.proc, self.size, self.shape = reader(path, w, h)

    def next(self):
        raw = self.proc.stdout.read(self.size)
        if len(raw) < self.size:
            return None
        return np.frombuffer(raw, np.uint8).reshape(*self.shape, 3)


# STILLS="9.7,23.5" saves those film times as PNG next to the output instead of writing the film: a quick look.
STILLS = sorted(round(float(v) * FPS) for v in __import__('os').environ.get('STILLS', '').split(',') if v)
hook = Stream(f'{cards_dir}/hook.mkv', W, H)
outro = Stream(f'{cards_dir}/outro.mkv', W, H)
site = Stream(f'{cap_dir}/raw.mkv', SW, SH)
writer = None if STILLS else subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out_path], stdin=subprocess.PIPE)

last_site = None
last_outro = None
for i in range(NF):
    t = i / FPS
    card = hook.next() if i < HOOK_FRAMES else None
    j = i - UI_FROM
    ui = None
    if 0 <= j < N:
        src = site.next()
        # Lines and the pointer keep state frame to frame, so a quick look still composes the site around each still.
        if src is not None and (not STILLS or any(0 <= s_ - i < 12 for s_ in STILLS)):
            ui = site_frame(src, j, t)
            last_site = ui
    if i >= OUTRO_FROM:
        o = outro.next()
        last_outro = o if o is not None else last_outro
    zoom_from = (UI_FROM + N) / FPS - ZOOM
    if card is not None and ui is None:
        frame = card
    elif card is not None and ui is not None:
        # The matched dissolve: the headline stays put while the site appears around it.
        a = in_out((t - T0) / DISSOLVE)
        frame = (card.astype(np.float32) * (1 - a) + ui.astype(np.float32) * a).astype(np.uint8)
    elif t < zoom_from:
        frame = ui if ui is not None else last_site
    elif ui is not None and last_outro is not None:
        # Zoom through: the site rushes past the camera and the closing cards settle in.
        a = in_out((t - zoom_from) / ZOOM)
        leaving = scaled(ui, 1 + 0.14 * a, blur=6 * a)
        arriving = scaled(last_outro, 0.94 + 0.06 * a)
        frame = (leaving.astype(np.float32) * (1 - a) + arriving.astype(np.float32) * a).astype(np.uint8)
    else:
        frame = last_outro if last_outro is not None else last_site
    if STILLS:
        if i in STILLS and frame is not None:
            Image.fromarray(frame).save(out_path.rsplit('.', 1)[0] + f'-{i / FPS:.2f}.png')
        if i > STILLS[-1]:
            break
        continue
    writer.stdin.write(np.ascontiguousarray(frame).tobytes())
    if i % 300 == 0:
        print(f'composed {i}/{NF}', flush=True)

for s in (hook, outro, site):
    s.proc.stdout.close()
    s.proc.kill() if STILLS else s.proc.wait()
if STILLS:
    sys.exit(0)
writer.stdin.close()
writer.wait()


# ------------------------------------------------------------------ subtitles
def stamp(s):
    ms = int(round(s * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


lines = [
    (0.15, 2.5, 'You meet a trader in the forest.'),
    (2.5, 5.0, 'He has what you want. You have what he wants.'),
    (5.0, 7.5, 'So who sends first? Send first and hope, or pay someone to hold it.'),
    (7.5, 8.1, 'Nobody does.'),
    (8.1, 10.0, 'Nothing crosses until you are both ready.'),
]
lines += [(c['at'], c['until'], c['text']) for c in captions]
lines += [
    (63.75, 66.25, 'The contract holds both sides.'),
    (66.25, 68.75, 'You can walk away until the swap.'),
    (68.75, 71.25, 'Not even the admin can move a deposit.'),
    (71.5, FILM_END, 'Trade Window. Try a practice room. Nothing touches a chain. tradewindow.xyz'),
]
# Russian subtitles for the owner's channels; the picture keeps the site's English.
RU = {
    'You meet a trader in the forest.': 'В лесу вы встречаете торговца.',
    'He has what you want. You have what he wants.': 'У него есть то, что нужно вам. У вас есть то, что нужно ему.',
    'So who sends first? Send first and hope, or pay someone to hold it.': 'Так кто отправит первым? Отправить и надеяться или платить посреднику.',
    'Nobody does.': 'Никто.',
    'Nothing crosses until you are both ready.': 'Ничего не перейдёт, пока вы оба не готовы.',
    'Trade Window: a trade room for two on gno.land.': 'Trade Window: комната обмена для двоих на gno.land.',
    'Six rules, all on one screen.': 'Шесть правил, и все на одном экране.',
    'The swap is one function. Read it.': 'Обмен — это одна функция. Её можно прочитать.',
    'Open a room. The gnome trader sits down.': 'Откройте комнату. Гном-торговец садится напротив.',
    'He puts in 25 wrapped GNOT and a lantern.': 'Он кладёт 25 wrapped GNOT и фонарь.',
    'Point at an item to see what it is.': 'Наведите на предмет, чтобы увидеть, что это.',
    'An NFT crosses whole, with no fee.': 'NFT переходит целиком и без комиссии.',
    'A token nobody verified stays out.': 'Непроверенный токен в комнату не попадёт.',
    'Put in 10 GNOT. The contract holds it.': 'Положите 10 GNOT. Их держит контракт.',
    'Get ready on the version you checked.': 'Подтвердите готовность на версии, которую проверили.',
    'He changes his offer? Your ready mark drops.': 'Он поменял предложение? Ваша готовность снимается.',
    'Look again. Nothing moved without you.': 'Посмотрите ещё раз. Без вас ничего не сдвинулось.',
    'Both ready: it all swaps in one transaction.': 'Оба готовы: всё меняется одной транзакцией.',
    'The lantern is yours. No middleman needed.': 'Фонарь ваш. Посредник не понадобился.',
    'In a hurry? Take a named price.': 'Торопитесь? Примите названную цену.',
    'Look, accept, and it trades in one step.': 'Посмотрели, приняли, и обмен прошёл в один шаг.',
    'The contract holds both sides.': 'Контракт держит обе стороны.',
    'You can walk away until the swap.': 'До обмена можно уйти в любой момент.',
    'Not even the admin can move a deposit.': 'Даже админ не может сдвинуть депозит.',
    'Trade Window. Try a practice room. Nothing touches a chain. tradewindow.xyz': 'Trade Window. Попробуйте тренировочную комнату: в сеть ничего не уходит. tradewindow.xyz',
}
missing = [text for _, _, text in lines if text not in RU]
if missing:
    print('no Russian line for:', missing)
for suffix, translate in (('en', lambda x: x), ('ru', lambda x: RU.get(x, x))):
    with open(out_path.rsplit('.', 1)[0] + f'.{suffix}.srt', 'w') as f:
        for k, (a, b, text) in enumerate(lines, 1):
            f.write(f'{k}\n{stamp(a)} --> {stamp(b)}\n{translate(text)}\n\n')
print(out_path)
