#!/usr/bin/env python3
"""Original score for the Trade Window film, synthesized in code and cut
to the film's bars (96 BPM): the opening story in B minor over a
heartbeat; a stop on "Nobody does." and a swell into the site; then a warm
groove in D major (a round kick, a brushed backbeat, a filtered shaker, a
bass, felt piano chords) that falls away while the trader changes his
offer and comes back for the swap; pad and piano for the closing lines;
a held D chord at the end. Quiet wooden taps for every press and key, a
warm swell on each settlement. No bells, no bright highs: the owner asked
for music that does not ring. Nothing is sampled or licensed; every sound
is generated here.

    python3 reel/music.py <capture-dir>/log.json out.wav
"""
import json
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
rng = np.random.default_rng(15)


def midi(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def sos(kind, freq, order=2):
    return signal.butter(order, freq, kind, fs=SR, output='sos')


def pan2(x, pan):
    left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * left, x * right])


def fade_tail(x, seconds=0.04):
    n = min(x.shape[-1], int(seconds * SR))
    ramp = np.linspace(1, 0, n)
    if x.ndim == 1:
        x[-n:] *= ramp
    else:
        x[:, -n:] *= ramp
    return x


class Mix:
    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.buses = {}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((2, self.n))
        return self.buses[name]

    def add(self, name, at, x, pan=0.0, gain=1.0):
        out = self.bus(name)
        if x.ndim == 1:
            x = pan2(x, pan)
        start = int(round(at * SR))
        if start < 0:
            x, start = x[:, -start:], 0
        end = min(self.n, start + x.shape[1])
        if end > start:
            out[:, start:end] += gain * x[:, :end - start]


def saw(freq, n, phase0=0.0):
    dt = freq / SR
    phase = (phase0 + dt * np.arange(n)) % 1.0
    return 2 * phase - 1


# ------------------------------------------------------------------ voices
def felt(note, velocity=0.7, length=3.2):
    """A felt piano: harmonic partials whose highs die fast, a soft hammer
    thump, everything low-passed so nothing rings."""
    f = midi(note)
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    decay = 1.9 * (220 / f) ** 0.45
    for k in range(1, 7):
        fk = f * k * (1 + 0.0003 * k * k)
        if fk > 6000:
            break
        amp = (0.55 + 0.45 * velocity) / k ** 1.6
        out += amp * np.sin(2 * np.pi * fk * t + rng.random()) * np.exp(-t / (decay / (1 + 0.9 * (k - 1))))
    thump = signal.sosfilt(sos('lowpass', 700), rng.standard_normal(n)) * np.exp(-t / 0.012) * 0.25 * velocity
    x = (out + thump) * np.minimum(1, t / 0.004)
    x = signal.sosfilt(sos('lowpass', 2400 + 2400 * velocity), x)
    return fade_tail(x * velocity)


def pad(notes, length, cutoff=850, attack=1.6, release=2.4):
    n = int((length + release) * SR)
    t = np.arange(n) / SR
    out = np.zeros((2, n))
    for note in notes:
        for detune, pos in ((-0.07, -0.6), (0.0, 0.0), (0.07, 0.6)):
            out += pan2(saw(midi(note) * 2 ** (detune / 12), n, rng.random()), pos)
    out = signal.sosfilt(sos('lowpass', cutoff, 4), out, axis=1)
    env = np.minimum(1, t / attack) * np.where(t < length, 1.0, np.exp(-(t - length) / (release / 4)))
    return fade_tail(out * env / (len(notes) * 3.0))


def sub(note, length):
    f = midi(note)
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.tanh(1.3 * np.sin(2 * np.pi * f * t)) * np.minimum(1, t / 0.03) * np.exp(-t / (length * 1.2))
    return fade_tail(x, 0.2)


def brush(length=0.5):
    """A soft brush on a snare, mostly air."""
    n = int(length * SR)
    t = np.arange(n) / SR
    x = signal.sosfilt(sos('bandpass', [500, 2200]), rng.standard_normal(n))
    env = np.minimum(1, t / 0.03) * np.exp(-t / 0.13)
    return fade_tail(x * env)


def tap(pitch=880, length=0.12):
    """A press: a small wooden tap, low and short."""
    n = int(length * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * pitch * t) * np.exp(-t / 0.018)
    knock = signal.sosfilt(sos('bandpass', [400, 1800]), rng.standard_normal(n)) * np.exp(-t / 0.005) * 0.5
    return fade_tail((body + knock) * np.minimum(1, t / 0.0008))


def air(length):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = signal.sosfilt(sos('lowpass', 420), rng.standard_normal((2, n)), axis=1)
    return x * (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * t))


def impulse(seconds, damp, seed):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.random.default_rng(seed).standard_normal((2, n)) * np.exp(-t * 6.9 / seconds)
    ir = signal.sosfilt(sos('lowpass', damp, 1), ir, axis=1)
    ir = np.concatenate([np.zeros((2, int(0.022 * SR))), ir], axis=1)
    return ir / np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))


def convolve(x, ir):
    return np.stack([signal.fftconvolve(x[c], ir[c])[:x.shape[1]] for c in range(2)])


def kick(length=0.45, punch=1.0):
    """A round, low kick: a falling sine with a soft knock, nothing clicky."""
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    knock = signal.sosfilt(sos('lowpass', 900), rng.standard_normal(n)) * np.exp(-t / 0.006) * 0.18 * punch
    return fade_tail(np.tanh(1.4 * (body + knock)) * np.minimum(1, t / 0.002))


def shaker(length=0.09):
    """A shaker, low-passed: texture, not shine."""
    n = int(length * SR)
    t = np.arange(n) / SR
    x = signal.sosfilt(sos('bandpass', [1800, 4500]), rng.standard_normal(n))
    return fade_tail(x * np.minimum(1, t / 0.012) * np.exp(-t / 0.03))


def bass(note, length):
    """A warm bass: a sine with a little of its saw, closed down to the low end."""
    f = midi(note)
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.35 * signal.sosfilt(sos('lowpass', 380), saw(f, n))
    env = np.minimum(1, t / 0.01) * np.exp(-t / (length * 0.9))
    return fade_tail(np.tanh(1.2 * x) * env, 0.05)


# ------------------------------------------------------------------ score
# 96 BPM. The film is cut to its bars: four for the opening story, one of six beats for the
# home page (10 to 13.75 s), then four-beat bars to the end (docs/reel/SCRIPT.md).
BPM = 96
BEAT = 60 / BPM
BAR = BEAT * 4
FILM_END = 76.25


def bar_starts():
    starts = [(0.0, 4), (2.5, 4), (5.0, 4), (7.5, 4), (10.0, 6)]
    at = 13.75
    while at < FILM_END - 0.01:
        starts.append((at, 4))
        at += BAR
    return starts


# Chords as (bass root, voicing). The story sits in B minor; the site and the trade in D major.
BM = (35, [50, 54, 57, 59, 62])     # Bm9-ish: D3 F#3 A3 B3 D4 over B1
GMAJ = (31, [50, 54, 55, 59, 62])   # Gmaj9: D3 F#3 G3 B3 D4 over G1
EM = (28, [50, 52, 55, 59, 62])     # Em7: D3 E3 G3 B3 D4 over E1
FS = (30, [49, 54, 58, 61, 64])     # F#7sus-ish: C#3 F#3 A#3 C#4 E4 over F#1
D = (38, [50, 54, 57, 61, 64])      # Dmaj9: D3 F#3 A3 C#4 E4
A = (33, [52, 54, 57, 59, 62])      # A6sus: E3 F#3 A3 B3 D4
STORY = [BM, GMAJ, EM, FS]
GROOVE = [D, BM, GMAJ, A]
TRUST = [GMAJ, A, BM, A]


def section(at):
    if at < 7.5:
        return 'story'
    if at < 10.0:
        return 'turn'
    if 41.25 <= at < 46.25:
        return 'tension'
    if 63.75 <= at < 71.25:
        return 'trust'
    if at >= 71.25:
        return 'end'
    return 'groove'


def score(log):
    t0 = log.get('t0', 0.0)
    duration = FILM_END
    marks = {k: v + t0 for k, v in log['marks'].items()}
    mix = Mix(duration + 4)
    groove_bar = 0
    trust_bar = 0
    for b, (at, beats) in enumerate(bar_starts()):
        length = beats * BEAT
        kind = section(at)
        if kind == 'story':
            root, notes = STORY[b]
            mix.add('pad', at, pad(notes[:4], length, cutoff=520, attack=1.2), gain=0.5)
            mix.add('sub', at, sub(root + 12, length * 0.95), gain=0.16)
            # A heartbeat under the question.
            for beat in range(beats):
                if beat % 2 == 0:
                    mix.add('drums', at + beat * BEAT, kick(0.35, 0.2), gain=0.32)
                    mix.add('drums', at + beat * BEAT + 0.19, kick(0.3, 0.1), gain=0.16)
            continue
        if kind == 'turn':
            # "Nobody does.": everything stops on one low note, then a swell lifts into the site.
            mix.add('piano', at, felt(35 + 12, 0.55, 2.4), gain=0.7)
            mix.add('pad', at + 0.6, pad([50, 54, 57, 61], 1.9, cutoff=900, attack=1.7, release=0.6), gain=0.75)
            continue
        if kind == 'end':
            # The closing chord, held.
            mix.add('drums', at, kick(0.6, 0.6), gain=0.5)
            mix.add('pad', at, pad([50, 54, 57, 61, 64], length + 1.0, cutoff=850, attack=0.4), gain=0.85)
            mix.add('sub', at, sub(38 + 12, length), gain=0.2)
            mix.add('piano', at, felt(38 + 12, 0.6, 5.0), gain=0.6)
            mix.add('piano', at + 0.02, felt(57, 0.45, 5.0), gain=0.5)
            mix.add('piano', at + BEAT * 2, felt(69, 0.4, 4.0), gain=0.4)
            continue
        if kind == 'trust':
            root, notes = TRUST[trust_bar % 4]
            trust_bar += 1
            mix.add('pad', at, pad(notes[:4], length, cutoff=700), gain=0.55)
            mix.add('sub', at, sub(root + 12, length * 0.95), gain=0.18)
            mix.add('drums', at, kick(0.4, 0.3), gain=0.34)
            for k, idx in enumerate([0, 2, 4, 3]):
                mix.add('piano', at + k * BEAT + rng.normal(0, 0.006), felt(notes[idx] + 12, 0.45 + 0.1 * (k == 0)), pan=-0.2 + 0.4 * idx / 4, gain=0.75)
            continue
        # The groove: the site and the trade.
        root, notes = GROOVE[groove_bar % 4]
        groove_bar += 1
        tense = kind == 'tension'
        mix.add('pad', at, pad(notes[:4], length, cutoff=650 if tense else 900), gain=0.42)
        for beat in range(beats):
            when = at + beat * BEAT
            if tense:
                # The drums fall away while his change is on screen: a muffled kick on one, the bass held.
                if beat == 0:
                    mix.add('drums', when, kick(0.4, 0.2), gain=0.3)
                continue
            if beat % 2 == 0:
                mix.add('drums', when, kick(), gain=0.5)
            else:
                mix.add('brush', when, brush(), pan=0.12, gain=0.2)
            if beat == beats - 2 and groove_bar % 2 == 0:
                mix.add('drums', when + BEAT / 2, kick(0.3, 0.5), gain=0.3)
            if at >= 13.75:
                for half in (0, 1):
                    mix.add('shaker', when + half * BEAT / 2 + rng.normal(0, 0.004), shaker(), pan=0.35, gain=0.05 + 0.03 * half)
        # Bass: the root on one, the octave on the and of two, the fifth before the next bar.
        if tense:
            mix.add('bass', at, bass(root + 12, length * 0.95), gain=0.3)
        else:
            for off, step, dur in ((0, 0, 0.9), (1.5, 12, 0.4), (2.0, 0, 0.6), (3.5, 7, 0.35)):
                if off < beats:
                    mix.add('bass', at + off * BEAT, bass(root + 12 + step, dur * BEAT * 2), gain=0.32)
            if beats == 6:
                mix.add('bass', at + 4 * BEAT, bass(root + 12, BEAT * 1.6), gain=0.3)
        # Felt piano: a chord on one, answered on the and of two and on four; a top note every other bar.
        for off, vel, idxs in ((0, 0.5, [0, 2, 3]), (1.5, 0.4, [1, 3]), (3, 0.42, [2, 4])):
            if tense and off > 0:
                continue
            for j, idx in enumerate(idxs):
                mix.add('piano', at + off * BEAT + j * 0.012 + rng.normal(0, 0.004), felt(notes[idx] + 12, vel), pan=-0.25 + 0.5 * idx / 4, gain=0.62)
        if tense:
            mix.add('piano', at + 2 * BEAT, felt(78 if groove_bar % 2 else 76, 0.45, 3.0), pan=0.25, gain=0.5)
        elif groove_bar % 2 == 0:
            top = [81, 78, 79, 76][(groove_bar // 2) % 4]
            mix.add('piano', at + BEAT * 2.5, felt(top, 0.42, 3.0), pan=0.2, gain=0.42)

    # The interface: a tap for every press, a softer one for every key.
    for c in log['clicks']:
        mix.add('ui', c + t0, tap(820 + rng.uniform(-30, 30)), pan=0.1, gain=0.32)
    for k in log['keys']:
        mix.add('ui', k + t0, tap(1150, 0.06), pan=0.1, gain=0.12)
    # A settlement: a warm swell and two notes, A3 then D4.
    for name in ('settled', 'price-settled'):
        if name in marks:
            at = marks[name] + 0.15
            mix.add('pad', at, pad([50, 57, 62, 66], 2.4, cutoff=1100, attack=0.5), gain=0.75)
            mix.add('piano', at, felt(57, 0.7, 3.5), gain=0.7)
            mix.add('piano', at + BEAT / 2, felt(62, 0.75, 4.0), gain=0.7)
    # The story's lines each get one low piano note.
    for at, note in ((0.15, 66), (2.5, 62), (3.75, 59), (5.0, 66), (6.25, 64)):
        mix.add('piano', at, felt(note, 0.5, 2.6), pan=-0.1, gain=0.6)
    mix.add('air', 0, air(duration + 4), gain=0.05)

    room = impulse(2.6, 3200, 7)
    hall = impulse(4.5, 2400, 11)
    piano = mix.bus('piano')
    pads = mix.bus('pad')
    drums = mix.bus('drums')
    out = (piano * 0.9 + convolve(piano, room) * 0.38
           + pads * 0.75 + convolve(pads, hall) * 0.35
           + mix.bus('sub') * 0.9 + mix.bus('bass') * 0.85
           + drums + convolve(drums, room) * 0.12
           + mix.bus('brush') + convolve(mix.bus('brush'), room) * 0.3
           + mix.bus('shaker') + convolve(mix.bus('shaker'), room) * 0.2
           + mix.bus('ui') + convolve(mix.bus('ui'), room) * 0.15
           + mix.bus('air'))
    # Nothing above 8 kHz needs to be there: take the shine off.
    out = signal.sosfilt(sos('lowpass', 8000, 2), out, axis=1)
    end = int(duration * SR)
    fade = int(1.6 * SR)
    out[:, end - fade:end] *= np.linspace(1, 0, fade) ** 1.5
    fade_in = int(0.4 * SR)
    out[:, :fade_in] *= np.linspace(0, 1, fade_in) ** 1.5
    return out[:, :end]


# ITU-R BS.1770 integrated loudness at 48 kHz, and true peak by 4x oversampling.
K_SHELF = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585])
K_HIGHPASS = ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])


def loudness(x):
    z = signal.lfilter(*K_HIGHPASS, signal.lfilter(*K_SHELF, x, axis=1), axis=1)
    block, step = int(0.4 * SR), int(0.1 * SR)
    power = np.array([np.sum(np.mean(z[:, s:s + block] ** 2, axis=1)) for s in range(0, z.shape[1] - block + 1, step)])
    level = -0.691 + 10 * np.log10(power + 1e-20)
    gated = power[level > -70]
    relative = -0.691 + 10 * np.log10(np.mean(gated)) - 10
    return -0.691 + 10 * np.log10(np.mean(power[(level > -70) & (level > relative)]))


def true_peak(x):
    return 20 * np.log10(np.max(np.abs(signal.resample_poly(x, 4, 1, axis=1))) + 1e-12)


def main():
    log = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    audio = score(log)
    # Quieter than the usual -14 LUFS: the owner asked for music that stays in the background.
    audio *= 10 ** ((-16 - loudness(audio)) / 20)
    peak = true_peak(audio)
    if peak > -1.5:
        audio *= 10 ** ((-1.5 - peak) / 20)
    wavfile.write(out, SR, audio.T.astype(np.float32))
    print(f'{out}: {audio.shape[1] / SR:.2f} s, {loudness(audio):.1f} LUFS integrated, true peak {true_peak(audio):.1f} dBTP')


if __name__ == '__main__':
    main()
