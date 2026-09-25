#!/usr/bin/env python3
"""Standardize all photos in assets/photos/ for in-app bundling.

For every *.jpg:
  - resize to max width 800px (keep aspect; hero renders ~450pt wide)
  - re-encode as JPEG quality 75 (sips)
  - strip EXIF/metadata (privacy + size)
  - enforce extension .jpg and non-trivial size

Prints before/after size summary. Idempotent. Uses macOS `sips` (no deps).
Usage: python3 scripts/format_photos.py [--dry-run]
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTOS = os.path.join(ROOT, "assets", "photos")
MAX_W = 800
QUALITY = 75
MIN_BYTES = 4000  # smaller = likely broken/placeholder

dry = "--dry-run" in sys.argv


def mb(n):
    return n / 1e6


def main():
    files = sorted(f for f in os.listdir(PHOTOS) if f.lower().endswith((".jpg", ".jpeg", ".png")))
    before = sum(os.path.getsize(os.path.join(PHOTOS, f)) for f in files)
    tiny, ok = [], 0
    for f in files:
        p = os.path.join(PHOTOS, f)
        sz = os.path.getsize(p)
        if sz < MIN_BYTES:
            tiny.append(f)
            continue
        # dimensions
        out = subprocess.run(["sips", "-g", "pixelWidth", p], capture_output=True, text=True).stdout
        try:
            w = int(out.strip().rsplit(" ", 1)[1])
        except Exception:
            w = 0
        cmds = ["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(QUALITY)]
        if w > MAX_W:
            cmds += ["--resampleWidth", str(MAX_W)]
        cmds.append(p)
        if dry:
            print("would:", " ".join(cmds[:2]), f"(w={w})", f)
            ok += 1
            continue
        r = subprocess.run(cmds, capture_output=True, text=True)
        if r.returncode != 0:
            print("ERR", f, r.stderr.strip()[:120])
        else:
            ok += 1
        # rename .jpeg/.png to .jpg after conversion
        base, ext = os.path.splitext(f)
        if ext.lower() != ".jpg":
            os.rename(p, os.path.join(PHOTOS, base + ".jpg"))
    after = sum(os.path.getsize(os.path.join(PHOTOS, f)) for f in os.listdir(PHOTOS) if f.endswith(".jpg"))
    print(f"processed: {ok} | tiny/skipped: {len(tiny)}")
    if tiny:
        print("tiny files (remove?):", ", ".join(tiny[:10]), "..." if len(tiny) > 10 else "")
    print(f"size: {mb(before):.1f} MB -> {mb(after):.1f} MB")


if __name__ == "__main__":
    main()
