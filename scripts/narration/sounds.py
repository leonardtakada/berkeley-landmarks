"""The guide's sounds, made the way the design canvas's Sounds board makes them (and the way
device/main/audio/sound.c strikes its chime): short scores of struck notes, bands of paper
noise and a felt thump. Bells sit 6 dB under the voices, ticks 12 dB under.

Kinds of note: chime (a sine and a soft octave), bell (three inharmonic partials), pure (a
sine), tick (a very short wooden knock). noise: paper, its band sliding from f0 to f1.
thump: the stamp's felt knock, falling from 320 to 160 Hz.
"""
import numpy as np
import librosa

SR = 24000
VOICE_RMS = 10 ** (-20 / 20)  # render_walk's speech level
UNDER = {"bell": 10 ** (-6 / 20), "tick": 10 ** (-12 / 20)}

PARTIALS = {
    "chime": ((1, 1, 1), (2, 0.28, 1)),
    "bell": ((1, 1, 1), (2.76, 0.35, 0.41), (5.4, 0.12, 0.2)),
    "pure": ((1, 1, 1),),
    "tick": ((1, 1, 1), (3.1, 0.3, 0.5)),
}

# Each architect's handover bell: a note of C major pentatonic, lower for deeper voices.
BELLS = {"howard": 523, "gutterson": 587, "coxhead": 659, "plachek": 784, "maybeck": 880, "esherick": 1047,
         "hays": 1175, "thomas": 1319, "ratcliff": 1568, "yelland": 1760, "morgan": 2093}


def _note(t, f, at, decay, level, kind):
    out = np.zeros_like(t)
    on = t >= at
    dt = t[on] - at
    for mult, amp, dmul in PARTIALS[kind]:
        env = amp * np.minimum(1, dt / 0.004) * np.exp(-dt / (decay * dmul))
        out[on] += level * env * np.sin(2 * np.pi * f * mult * dt)
    return out


def _noise(t, at, dur, f0, f1, level, rng):
    n = len(t)
    x = rng.standard_normal(n)
    spec = librosa.stft(x, n_fft=512, hop_length=128)
    freqs = librosa.fft_frequencies(sr=SR, n_fft=512)
    times = librosa.frames_to_time(np.arange(spec.shape[1]), sr=SR, hop_length=128)
    centre = np.interp(times, [at, at + dur], [f0, f1])
    width = centre / 1.2  # a band of about Q 1.2
    mask = np.exp(-0.5 * ((freqs[:, None] - centre[None, :]) / (width[None, :] / 2)) ** 2)
    y = librosa.istft(spec * mask, hop_length=128, length=n)
    y /= max(np.max(np.abs(y)), 1e-9)
    env = np.zeros(n)
    rise = max(0.002, dur * 0.35)
    env = np.interp(t, [at, at + rise, at + dur], [0, 1, 0], left=0, right=0)
    return level * 2.2 * env * y * 0.3


def _thump(t, at, level):
    out = np.zeros_like(t)
    on = t >= at
    dt = t[on] - at
    f = 320 * (160 / 320) ** np.minimum(1, dt / 0.07)
    phase = 2 * np.pi * np.cumsum(f) / SR
    out[on] = level * np.minimum(1, dt / 0.004) * np.exp(-dt / 0.035) * np.sin(phase)
    return out


def score(events, dur, under="bell", seed=1):
    """Renders a score, brought to its level under the voice by its loudest stretch: half a
    second, or the sound's own length if it's shorter (else silence dilutes a short sound and
    it comes out too loud)."""
    t = np.arange(int(dur * SR)) / SR
    rng = np.random.default_rng(seed)
    y = np.zeros_like(t)
    for e in events:
        k = e[0]
        if k == "noise":
            y += _noise(t, *e[1:], rng=rng)
        elif k == "thump":
            y += _thump(t, *e[1:])
        else:
            y += _note(t, *e[1:], kind=k)
    sounding = np.flatnonzero(np.abs(y) > 0.05 * np.max(np.abs(y)))
    win = int(min(0.5, max(0.03, (sounding[-1] - sounding[0]) / SR)) * SR)
    loudest = max(np.sqrt(np.mean(y[i:i + win] ** 2)) for i in range(0, max(1, len(y) - win + 1), max(1, win // 4)))
    return (y * VOICE_RMS * UNDER[under] / max(loudest, 1e-9)).astype(np.float32)


STAMP = [("thump", 0, 0.9), ("noise", 0, 0.012, 3500, 3500, 0.45)]


def found_you():
    return score([("chime", 784, 0, 0.22, 0.5), ("chime", 1047, 0.16, 0.4, 0.55)], 1.1)


def at_the_door():
    return score([("chime", 1318.5, 0, 0.35, 0.7), ("chime", 1046.5, 0.38, 0.5, 0.7)], 1.6)


def stamp():
    return score(STAMP, 0.4)


def handing_over(guest):
    return score([("noise", 0, 0.45, 700, 2800, 0.35), ("bell", BELLS[guest], 0.48, 1.0, 0.6)], 2.0)


def on_you_go():
    return score([("chime", 1047, 0, 0.25, 0.45), ("chime", 784, 0.2, 0.45, 0.45)], 1.2)


def walked(all_collected=True):
    if not all_collected:
        return stamp()
    return score(STAMP + [("chime", 1047, 0.35, 0.5, 0.5), ("chime", 1319, 0.5, 0.5, 0.5),
                          ("chime", 1568, 0.65, 1.0, 0.55)], 2.4)


def go_on_tick():
    return score([("tick", 2400, 0, 0.012, 0.4), ("noise", 0, 0.006, 4000, 4000, 0.2)], 0.16, under="tick")


def shade():
    return score([("tick", 1600, 0, 0.015, 0.4), ("noise", 0.02, 0.2, 2400, 1200, 0.22)], 0.36, under="tick")


def end_the_walk():
    return score([("tick", 1600, 0, 0.015, 0.4), ("tick", 1200, 0.09, 0.02, 0.4)], 0.3, under="tick")


def lost_the_sky():
    return score([("pure", 880, 0, 0.18, 0.3), ("pure", 880, 0.45, 0.18, 0.25)], 1.0)
