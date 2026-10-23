"""Packs the rendered narration for the guide's SD card (device/main/audio/player.c).

    python3 scripts/narration/pack_guide.py [--out narration-takes/guide]

From the walks render_walk.py made (narration-takes/walks/*/parts.json), writes one file per
part in the guide's format, IMA4 ADPCM at 16 kHz mono in a CAF (macOS's afconvert makes it;
about 8.5 KB a second, simple enough to decode on the guide without a codec library):
  lm<N>.caf    a stop's narration (landmark lm-N), shared by every walk it's on
  w<NN>i.caf   walk NN's introduction, w<NN>o.caf its end (NN as the guide numbers walks)
and parts.txt, a line per file: its name, its length in ms, and who speaks from when
("lm18 62600 ratcliff@0 guide@53600"), so the guide can change the credit and the
portrait's mood when the speaker does. The names are 8.3, for the card's FAT.

Also the free map's tiles (device/main/ui/mapview.c), tiles.bin and tiles.idx, by
scripts/device/pack-tiles.mjs.
"""
import argparse
import json
import subprocess
from pathlib import Path

GAP_PARAGRAPH, GAP_SPEAKER = 0.45, 0.7  # render_walk's

ap = argparse.ArgumentParser()
ap.add_argument("--out", default="narration-takes/guide")
a = ap.parse_args()

tours = json.loads(subprocess.check_output(
    ["npx", "tsx", "-e", "import { tours } from './data/tours'; console.log(JSON.stringify(tours.map(t => t.id)))"],
    stderr=subprocess.DEVNULL).decode().strip().splitlines()[-1])
out = Path(a.out)
out.mkdir(parents=True, exist_ok=True)


def name(pid, walk):
    if pid.startswith("lm-"):
        return "lm" + pid[3:]
    return f"w{walk:02d}{'i' if pid.endswith('-intro') else 'o'}"


def sections(part):
    """Who speaks from when, in ms, from the paragraphs' lengths and render_walk's gaps."""
    at, last, out = 0.0, None, []
    for p in part["paragraphs"]:
        if last is not None:
            at += GAP_SPEAKER if p["speaker"] != last else GAP_PARAGRAPH
        if p["speaker"] != last:
            out.append(f"{p['speaker']}@{round(at * 1000)}")
        at += p["seconds"]
        last = p["speaker"]
    return out


index, total = {}, 0
for n, tour in enumerate(tours, 1):
    for part in json.loads((Path("narration-takes/walks") / tour / "parts.json").read_text()):
        stem = name(part["part"], n)
        if stem in index:
            continue
        caf = out / f"{stem}.caf"
        src = Path(part["file"])
        if not caf.exists() or caf.stat().st_mtime < src.stat().st_mtime:
            subprocess.run(["afconvert", "-f", "caff", "-d", "ima4@16000", "-c", "1", str(src), str(caf)], check=True)
        index[stem] = f"{stem} {round(part['seconds'] * 1000)} " + " ".join(sections(part))
        total += caf.stat().st_size
(out / "parts.txt").write_text("\n".join(index[k] for k in sorted(index)) + "\n")
print(f"{len(index)} narration files, {total / 1e6:.1f} MB → {out}")

# The map's tiles: saved again as baseline JPEGs, which the guide's decoder can read.
subprocess.run(["node", "scripts/device/pack-tiles.mjs", str(out)], check=True)
