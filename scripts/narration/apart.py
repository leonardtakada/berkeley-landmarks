"""How far a voice's takes stand from the rest of the locked cast, to keep voices apart.

    python scripts/narration/apart.py key [--takes narration-takes]

For each <key>-<seed>.wav take: how like each other locked voice of its register it is
(fingerprint.py), most alike first. Lower is further apart: unrelated voices of a register
score about −0.5 to 0.4, a voice against its own reference about 0.6.
Use the same Python as design_takes.py.
"""
import argparse
import json
from pathlib import Path

from fingerprint import Fingerprints, cast, load24

ap = argparse.ArgumentParser()
ap.add_argument("key")
ap.add_argument("--takes", default="narration-takes")
a = ap.parse_args()

fp = Fingerprints(cast(), exclude=(a.key,))
rows = []
for f in sorted(Path(a.takes).glob(f"{a.key}-*.wav")):
    sims = fp.likeness(load24(f))
    ranked = sorted(sims.items(), key=lambda kv: -kv[1])
    rows.append({"take": f.stem, "most_alike": ranked[0][0] if ranked else None,
                 "alike": {k: round(s, 2) for k, s in ranked[:3]}})
    print(json.dumps(rows[-1]))
(Path(a.takes) / f"{a.key}-apart.json").write_text(json.dumps(rows, indent=2))
