"""What can be checked without ears: each take's pitch and pace against its brief, and faults.

Pitch is the median of the voiced fundamental (pYIN); its spread is the 10th–90th
percentile range in semitones (how much the voice moves). Pace is words a minute from
first sound to last. Faults: clipping, or a take slower than 90 words a minute (a runaway).
Targets and lines come from data/narration/voices.json.

Run from the repo root, with the same Python as design_takes.py:
    ~/.venvs/qwen-tts/bin/python scripts/narration/measure.py [--out narration-takes]
Prints a line per take and writes <out>/measures.json.
"""
import argparse
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

ap = argparse.ArgumentParser()
ap.add_argument("--out", default="narration-takes")
args = ap.parse_args()

voices = json.loads(Path("data/narration/voices.json").read_text())["voices"]
out = Path(args.out)

rows = []
for f in sorted(out.glob("*.wav")):
    key, seed = f.stem.rsplit("-", 1)
    if key not in voices:
        continue
    v = voices[key]
    y, sr = sf.read(f, dtype="float32", always_2d=False)
    intervals = librosa.effects.split(y, top_db=40)  # the span of speech: within 40 dB of the peak
    start, end = intervals[0][0], intervals[-1][1]
    span = (end - start) / sr
    gaps = [(b[0] - a[1]) / sr for a, b in zip(intervals, intervals[1:])]
    f0, voiced, _ = librosa.pyin(y[start:end], fmin=60, fmax=420, sr=sr, frame_length=2048)
    f0 = f0[voiced & ~np.isnan(f0)]
    words = len(v["line"].split())
    rows.append({
        "key": key,
        "seed": int(seed),
        "seconds": round(len(y) / sr, 1),
        "hz": round(float(np.median(f0))) if len(f0) else None,
        "target_hz": v["target"]["hz"],
        "moves_st": round(float(12 * np.log2(np.percentile(f0, 90) / np.percentile(f0, 10))), 1) if len(f0) else None,
        "wpm": round(words / span * 60),
        "target_wpm": v["target"]["wpm"],
        "longest_gap_s": round(max(gaps), 2) if gaps else 0,
        "clipped": bool(np.max(np.abs(y)) >= 0.999),
        "runaway": bool(span > words / 90 * 60),
    })

for r in rows:
    print(json.dumps(r))
(out / "measures.json").write_text(json.dumps(rows, indent=2))
