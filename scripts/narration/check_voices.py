"""Checks that locked voices hold: each line spoken by speak.py against the voices' references.

For each spoken line: how like its own reference it is, against the most alike other voice
of its register (fingerprint.py), and its pitch against the reference's. A voice holds when
the line is nearest its own reference by a clear margin (0.2).

    python scripts/narration/check_voices.py [--spoken narration-takes/spoken]
Use the same Python as design_takes.py.
"""
import argparse
import json
import math
from pathlib import Path

from fingerprint import Fingerprints, cast, load24, pitch

ap = argparse.ArgumentParser()
ap.add_argument("--spoken", default="narration-takes/spoken")
a = ap.parse_args()

fp = Fingerprints(cast())
rows = []
for f in sorted(Path(a.spoken).glob("*.wav")):
    key = f.stem
    if key not in fp.refs:
        continue
    y = load24(f)
    sims = fp.likeness(y)
    own = sims.pop(key, None)
    if own is None:
        rows.append({"key": key, "holds": False, "note": "came out in the other register from its reference"})
        print(json.dumps(rows[-1]))
        continue
    near = max(sims, key=sims.get)
    p_ref, p_new = pitch(fp.audio[key]), pitch(y)
    rows.append({
        "key": key,
        "own": round(own, 2),
        "nearest_other": near,
        "other": round(sims[near], 2),
        "pitch_ref": round(p_ref),
        "pitch_new": round(p_new),
        "drift_st": round(12 * math.log2(p_new / p_ref), 1),
        "holds": own > sims[near] + 0.2,
    })
    print(json.dumps(rows[-1]))
(Path(a.spoken) / "check.json").write_text(json.dumps(rows, indent=2))
