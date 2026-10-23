"""Locks voices: the picked take of each becomes its reference recording.

    python scripts/narration/lock_voices.py key=seed [key=seed ...] [--takes narration-takes]

Copies narration-takes/<key>-<seed>.wav to data/narration/voices/<key>.flac and records the
pick in data/narration/voices.json ("voice": take, reference). From then on every line in
that voice is cloned from the reference (speak.py), so the voice is the same at every stop.
Use the same Python as design_takes.py.
"""
import argparse
import json
from pathlib import Path

import soundfile as sf

ap = argparse.ArgumentParser()
ap.add_argument("picks", nargs="+", help="key=seed")
ap.add_argument("--takes", default="narration-takes")
args = ap.parse_args()

path = Path("data/narration/voices.json")
cast = json.loads(path.read_text())
refs = Path("data/narration/voices")
refs.mkdir(exist_ok=True)

for pick in args.picks:
    key, seed = pick.split("=")
    if key not in cast["voices"]:
        raise SystemExit(f"no voice {key}")
    audio, sr = sf.read(Path(args.takes) / f"{key}-{seed}.wav")
    ref = refs / f"{key}.flac"
    sf.write(ref, audio, sr, format="FLAC")
    cast["voices"][key]["voice"] = {"take": int(seed), "reference": str(ref)}
    print(f"{key}: take {seed} → {ref}")

path.write_text(json.dumps(cast, indent=2, ensure_ascii=False) + "\n")
