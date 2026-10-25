#!/usr/bin/env python3
"""Drive the pocket guide over its USB console and save what's on its screen.

Each argument is one step, run in order:

    show <screen>     a console command (show, walk, stats, ...), sent as is
    wait:<seconds>    pause on the Mac, to let an animation run
    snap:<file.png>   save the screen, masked to its circle

    python scripts/device/snap.py "show walks" wait:1.5 snap:walks.png

Needs pyserial. Connecting doesn't reset the guide: the USB-Serial/JTAG
resets the ESP32-S3 whenever RTS is high while DTR is low, so RTS drops first.
"""
import argparse
import base64
import binascii
import struct
import sys
import time
import zlib

import serial

DONE = ("OK", "ERR", "STATS", "BENCH", "SNAP-END", "SNAP-ERR")


def open_port(port):
    s = serial.Serial()
    s.port = port
    s.baudrate = 115200
    s.timeout = 0.5
    # pyserial sets DTR before RTS when it opens the port; leave both to us.
    s.dsrdtr = True
    s.rtscts = True
    s.open()
    s.rtscts = False
    s.dsrdtr = False
    s.rts = False
    s.dtr = False
    s.reset_input_buffer()
    return s


def read_line(s, deadline):
    buf = b""
    while time.time() < deadline:
        buf += s.readline()
        if buf.endswith(b"\n"):
            return buf.decode("utf-8", "replace").rstrip("\r\n")
    raise TimeoutError("the guide didn't answer")


def is_base64(text):
    try:
        base64.b64decode(text, validate=True)
        return True
    except binascii.Error:
        return False


def command(s, line, timeout=10.0):
    """Sends a line; returns (reply, base64 lines of a snapshot if any)."""
    s.write((line + "\n").encode())
    deadline = time.time() + timeout
    picture, size = [], None
    while True:
        text = read_line(s, deadline)
        if text.startswith("SNAP ") and size is None:
            size = tuple(int(n) for n in text.split()[1:3])
        elif size and not text.startswith("SNAP-") and is_base64(text):
            # A line of the picture, even one whose base64 happens to begin "OK" or "ERR".
            picture.append(text)
        elif text.startswith(("SNAP-END", "SNAP-ERR")) and size is None and line == "snap":
            # The tail of an earlier snapshot that was given up on: ours is still to come.
            continue
        elif text.startswith(DONE):
            return text, size, picture
        else:
            print(f"  [guide] ({len(text)} chars) {text}", file=sys.stderr)


def save_png(path, size, lines):
    w, h = size
    raw = base64.b64decode("".join(lines))
    if len(raw) != w * h * 2:
        raise ValueError(f"snapshot is {len(raw)} bytes, expected {w * h * 2}")
    r2 = (w / 2) ** 2
    rows = bytearray()
    for y in range(h):
        rows.append(0)
        for x in range(w):
            px = raw[(y * w + x) * 2] | raw[(y * w + x) * 2 + 1] << 8
            r, g, b = (px >> 11) & 31, (px >> 5) & 63, px & 31
            inside = (x + 0.5 - w / 2) ** 2 + (y + 0.5 - h / 2) ** 2 <= r2
            rows += bytes((r << 3 | r >> 2, g << 2 | g >> 4, b << 3 | b >> 2, 255 if inside else 0))

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(bytes(rows), 9)))
        f.write(chunk(b"IEND", b""))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-p", "--port", default="/dev/cu.usbmodem31101")
    ap.add_argument("steps", nargs="+")
    args = ap.parse_args()

    s = open_port(args.port)
    for step in args.steps:
        if step.startswith("wait:"):
            time.sleep(float(step[5:]))
        elif step.startswith("snap:"):
            reply, size, lines = command(s, "snap", timeout=30)
            if not reply.startswith("SNAP-END"):
                sys.exit(f"snap failed: {reply}")
            save_png(step[5:], size, lines)
            print(f"saved {step[5:]}")
        else:
            reply, _, _ = command(s, step)
            print(f"{step}: {reply}")
            if reply.startswith("ERR"):
                sys.exit(1)


if __name__ == "__main__":
    main()
