"""Checks rendered walks (render_walk.py): every paragraph in the right voice, at what pace and level.

    python scripts/narration/check_walk.py [tour-id ...] [--all] [--out narration-takes]

Cuts each part back into its paragraphs (the walk's parts.json gives where each part is and
its paragraphs' lengths; the gaps between are render_walk's), and for each: which locked voice
of its register it is most like (fingerprint.py), against the speaker it should be, its pace,
and its speech level. Writes check.json beside the walk's parts.json.
Use the same Python as design_takes.py.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf

from fingerprint import Fingerprints, cast

SR = 24000
GAP_PARAGRAPH, GAP_SPEAKER = 0.45, 0.7

ap = argparse.ArgumentParser()
ap.add_argument("tours", nargs="*")
ap.add_argument("--all", action="store_true")
ap.add_argument("--out", default="narration-takes")
a = ap.parse_args()

walks = Path(a.out) / "walks"
if a.all:
    folders = sorted(p for p in walks.iterdir() if (p / "parts.json").exists())
else:
    folders = [walks / t for t in (a.tours or ["tour-downtown"])]
voices = cast()
fp = Fingerprints(voices)


def check(part):
    """One row per paragraph of a part."""
    y, _ = sf.read(part["file"], dtype="float32")
    rows, at, last = [], 0.0, None
    for p in part["paragraphs"]:
        if last is not None:
            at += GAP_SPEAKER if p["speaker"] != last else GAP_PARAGRAPH
        seg = y[int(at * SR): int((at + p["seconds"]) * SR)]
        at += p["seconds"]
        last = p["speaker"]
        sims = fp.likeness(seg)
        loud = seg[np.abs(seg) > 0.01]
        rows.append({
            "part": part["part"],
            "speaker": p["speaker"],
            "heard_as": max(sims, key=sims.get) if sims else None,
            "likeness": round(sims.get(p["speaker"], float("nan")), 2),
            "wpm": p["wpm"],
            "target_wpm": voices[p["speaker"]]["target"]["wpm"],
            "level_db": round(float(20 * np.log10(np.sqrt(np.mean(loud ** 2)))), 1) if len(loud) else None,
        })
    return rows


seen = {}  # a stop on several walks is checked once
for folder in folders:
    rows = []
    for part in json.loads((folder / "parts.json").read_text()):
        if part["part"] not in seen:
            seen[part["part"]] = check(part)
        rows += seen[part["part"]]
    (folder / "check.json").write_text(json.dumps(rows, indent=2))
    wrong = [r for r in rows if r["heard_as"] != r["speaker"]]
    print(f"{folder.name}: {len(rows)} paragraphs, {len(wrong)} heard as someone else", flush=True)
    for r in wrong:
        print("  " + json.dumps(r), flush=True)
