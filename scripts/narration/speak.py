"""Speaks lines in locked voices: Qwen3-TTS's Base model cloned from each voice's reference
recording (lock_voices.py), so a voice sounds the same in every line it reads.

    python scripts/narration/speak.py key "A line to speak." [--out narration-takes/spoken]
    python scripts/narration/speak.py --next [key ...]   # each voice reads on from its audition line

--next is the check that a locked voice holds: each voice reads the sentences that follow its
audition line in its own script, which it has never spoken. (Voices with no script are skipped.)
The Base model (4.5 GB) downloads to ~/.cache/huggingface on first run. Use the same Python as
design_takes.py.
"""
import argparse
import json
import re
import time
from pathlib import Path

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"

ap = argparse.ArgumentParser()
ap.add_argument("args", nargs="*")
ap.add_argument("--next", action="store_true")
ap.add_argument("--out", default="narration-takes/spoken")
a = ap.parse_args()

voices = json.loads(Path("data/narration/voices.json").read_text())["voices"]


def reads_on(v, limit=200):
    """The sentences after the audition line in the voice's own script, up to about `limit` characters."""
    src = Path(v["from"])
    if not src.exists():
        return None
    text = " ".join(src.read_text().split())
    at = text.find(v["line"])
    if at < 0:
        return None
    rest = re.sub(r"^\s*", "", text[at + len(v["line"]):])
    rest = re.split(r"\s## ", rest)[0]  # stay in this speaker's section
    out = ""
    for s in re.findall(r"[^.!?]+[.!?]+", rest):
        if out and len(out) + len(s) > limit:
            break
        out += s
    return out.strip() or None


if a.next:
    jobs = [(k, reads_on(voices[k])) for k in (a.args or voices)]
    jobs = [(k, t) for k, t in jobs if t]
else:
    if len(a.args) != 2:
        raise SystemExit('speak.py key "line"  or  speak.py --next [key ...]')
    jobs = [(a.args[0], a.args[1])]

out = Path(a.out)
out.mkdir(parents=True, exist_ok=True)
t0 = time.time()
tts = Qwen3TTSModel.from_pretrained(MODEL, device_map="mps", dtype=torch.bfloat16)
print(f"loaded in {time.time() - t0:.0f} s", flush=True)

for key, text in jobs:
    v = voices[key]
    if "voice" not in v:
        raise SystemExit(f"{key} isn't locked yet (lock_voices.py)")
    prompt = tts.create_voice_clone_prompt(ref_audio=v["voice"]["reference"], ref_text=v["line"])
    torch.manual_seed(1)
    t = time.time()
    wavs, sr = tts.generate_voice_clone(text=text, language="English", voice_clone_prompt=prompt)
    sf.write(out / f"{key}.wav", wavs[0], sr)
    (out / f"{key}.txt").write_text(text + "\n")
    print(f"{key}: {len(wavs[0]) / sr:.1f} s in {time.time() - t:.0f} s: {text[:70]}", flush=True)
