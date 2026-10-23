"""Auditions: takes of each voice in data/narration/voices.json, made from its brief and speaking its line.

Runs Qwen3-TTS VoiceDesign (Apache-2.0) locally on the Mac's GPU; nothing leaves the machine.
Each take is <out>/<key>-<seed>.wav, the seed fixed so a picked take can be made again.

Setup, once (Python 3.12+; the model, 4.5 GB, downloads to ~/.cache/huggingface on first run):
    python3 -m venv ~/.venvs/qwen-tts && ~/.venvs/qwen-tts/bin/pip install qwen-tts torch

Run from the repo root:
    ~/.venvs/qwen-tts/bin/python scripts/narration/design_takes.py [key ...] [--seeds 1,2,3] [--out narration-takes]

About real time on an M3 Ultra: a 12 s line takes about 12 s.
"""
import argparse
import json
import time
from pathlib import Path

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"

ap = argparse.ArgumentParser()
ap.add_argument("keys", nargs="*", help="voices to make (default: all)")
ap.add_argument("--seeds", default="1,2,3")
ap.add_argument("--out", default="narration-takes")
args = ap.parse_args()

voices = json.loads(Path("data/narration/voices.json").read_text())["voices"]
keys = args.keys or list(voices)
seeds = [int(s) for s in args.seeds.split(",")]
out = Path(args.out)
out.mkdir(exist_ok=True)

t0 = time.time()
tts = Qwen3TTSModel.from_pretrained(MODEL, device_map="mps", dtype=torch.bfloat16)
print(f"loaded in {time.time() - t0:.0f} s", flush=True)

for key in keys:
    v = voices[key]
    for seed in seeds:
        torch.manual_seed(seed)
        t = time.time()
        wavs, sr = tts.generate_voice_design(text=v["line"], instruct=v["brief"], language="English")
        sf.write(out / f"{key}-{seed}.wav", wavs[0], sr)
        print(f"{key} take {seed}: {len(wavs[0]) / sr:.1f} s of audio in {time.time() - t:.0f} s", flush=True)
