#!/usr/bin/env python3
"""Copies the guide's card bundle (scripts/narration/pack_guide.py: the narration and the map's
tiles) onto the guide's SD card, over
the same USB console as snap.py; the guide writes it to /sdcard/guide (console put).

    python scripts/device/load-narration.py [--dir narration-takes/guide] [--port /dev/cu.usbmodem31101]

A file already on the card with the same size and CRC-32 is skipped, so loading again after a
change sends only what changed. parts.txt goes last, so the guide never reads an index whose
audio isn't there yet. Needs pyserial; the guide must be running firmware with put and stat.
"""
import argparse
import sys
import time
import zlib
from pathlib import Path

import snap

CHUNK = 8192  # console.c's PUT_CHUNK

ap = argparse.ArgumentParser()
ap.add_argument("--dir", default="narration-takes/guide")
ap.add_argument("--port", default="/dev/cu.usbmodem31101")
a = ap.parse_args()


def reply(s, timeout, wanted=("OK", "ERR")):
    """The guide's next answer, past any log lines it prints meanwhile."""
    deadline = time.time() + timeout
    while True:
        text = snap.read_line(s, deadline)
        if text.startswith(wanted):
            return text


class Failed(Exception):
    pass


def resync(s):
    """After a failed put, bytes still in flight land on the guide's command line: let them pass."""
    time.sleep(1.0)
    s.write(b"\n\n")
    time.sleep(0.5)
    s.reset_input_buffer()


def send(s, path):
    """One file onto the card unless it's there already; returns the bytes sent."""
    data = path.read_bytes()
    crc = f"{zlib.crc32(data):08x}"
    s.write(f"stat {path.name}\n".encode())
    have = reply(s, 30)
    if have == f"OK {len(data)} {crc}":
        return 0
    if have.startswith("ERR") and have != "ERR none":
        raise Failed(have)
    s.write(f"put {path.name} {len(data)}\n".encode())
    ready = reply(s, 30, ("READY", "ERR"))
    if ready != "READY":
        raise Failed(ready)
    # A chunk at a time, each acknowledged with "+" once it's on the card: the guide's USB
    # receive buffer drops whatever it can't hold.
    for at in range(0, len(data), CHUNK):
        s.write(data[at:at + CHUNK])
        ack = reply(s, 15, ("+", "ERR"))
        if ack != "+":
            raise Failed(f"at {at} bytes: {ack}")
    done = reply(s, 30)
    if done != f"OK {len(data)} {crc}":
        raise Failed(f"sent {len(data)} bytes, {crc}; the guide says {done}")
    return len(data)


folder = Path(a.dir)
files = sorted(p for p in folder.iterdir() if p.is_file() and p.name != "parts.txt" and not p.name.startswith("."))
files.append(folder / "parts.txt")
s = snap.open_port(a.port)
sent = skipped = retries = 0
t0 = time.time()
for i, path in enumerate(files, 1):
    for attempt in range(4):
        try:
            n = send(s, path)
            break
        except (Failed, TimeoutError) as e:
            if attempt == 3:
                sys.exit(f"{path.name}: {e}")
            print(f"  {path.name}: {e}; again", flush=True)
            retries += 1
            resync(s)
    if n == 0:
        skipped += 1
        continue
    sent += n
    rate = sent / max(time.time() - t0, 0.001) / 1000
    print(f"[{i}/{len(files)}] {path.name}: {n / 1000:.0f} KB ({rate:.0f} KB/s)", flush=True)
print(f"{len(files) - skipped} sent, {skipped} already there, {retries} resent, {sent / 1e6:.1f} MB in {time.time() - t0:.0f} s")
