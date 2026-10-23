"""Speaker fingerprints for telling voices apart: shared by check_voices.py and apart.py.

The Base model's speaker embedding, compared by cosine. Raw embeddings share a large common
part, so each is centred on the average of its register (low voices with low, high with
high). Centred on the whole cast instead, ten men to two women, any two women scored about
0.7 alike just for being women: unrelated women did, and so did the guide and Julia Morgan.
The high register has few cast voices, so four voices from outside the cast (CALIBRATION)
fill out its average. Calibrated that way, a voice reading a new line scores about 0.6 to
its own reference, unrelated voices of the same register −0.5 to 0.4.
"""
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

HIGH_HZ = 165  # median pitch above this: the high register
CALIBRATION = {
    "british": "A young British woman of about 25 with a bright, quick soprano voice.",
    "southern": "An elderly Southern American woman of about 75 with a slow, drawling, husky voice.",
    "contralto": "A deep-voiced American woman of about 45, a low contralto, calm as a newsreader.",
    "teen": "A teenage American girl of about 16, chatty and fast, with a bright voice.",
}
CALIBRATION_DIR = Path("narration-takes/calibration")


def load24(path):
    y, sr = sf.read(path, dtype="float32", always_2d=False)
    return librosa.resample(y, orig_sr=sr, target_sr=24000) if sr != 24000 else y


def pitch(y):
    f0, voiced, _ = librosa.pyin(y, fmin=60, fmax=420, sr=24000, frame_length=2048)
    return float(np.median(f0[voiced & ~np.isnan(f0)]))


def calibration_takes(line):
    """The calibration voices, made once with VoiceDesign and kept."""
    CALIBRATION_DIR.mkdir(parents=True, exist_ok=True)
    missing = [k for k in CALIBRATION if not (CALIBRATION_DIR / f"{k}.wav").exists()]
    if missing:
        vd = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", device_map="mps", dtype=torch.bfloat16)
        for k in missing:
            torch.manual_seed(1)
            w, sr = vd.generate_voice_design(text=line, instruct=CALIBRATION[k], language="English")
            sf.write(CALIBRATION_DIR / f"{k}.wav", w[0], sr)
        del vd
    return [CALIBRATION_DIR / f"{k}.wav" for k in CALIBRATION]


class Fingerprints:
    def __init__(self, voices, exclude=()):
        """The locked voices' references (less `exclude`), centred by register."""
        self.tts = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map="mps", dtype=torch.float32)
        locked = {k: v for k, v in voices.items() if "voice" in v and k not in exclude}
        self.audio = {k: load24(v["voice"]["reference"]) for k, v in locked.items()}
        self.raw = {k: self.embedding(y) for k, y in self.audio.items()}
        self.register = {k: self.register_of(y) for k, y in self.audio.items()}
        line = next(iter(voices.values()))["line"]
        cal = [load24(p) for p in calibration_takes(line)]
        pool = {"low": [], "high": []}
        for k, e in self.raw.items():
            pool[self.register[k]].append(e)
        for y in cal:
            pool[self.register_of(y)].append(self.embedding(y))
        self.mean = {r: np.mean(es, axis=0) for r, es in pool.items() if es}
        self.refs = {k: self.centred(e, self.register[k]) for k, e in self.raw.items()}

    def embedding(self, y):
        with torch.inference_mode():
            e = self.tts.model.extract_speaker_embedding(audio=y, sr=24000).float().cpu().numpy().ravel()
        return e / np.linalg.norm(e)

    @staticmethod
    def register_of(y):
        return "high" if pitch(y) > HIGH_HZ else "low"

    def centred(self, e, register):
        c = e - self.mean[register]
        return c / np.linalg.norm(c)

    def likeness(self, y):
        """How like each locked voice of its own register this audio is: {key: cosine}."""
        r = self.register_of(y)
        e = self.centred(self.embedding(y), r)
        return {k: float(e @ ref) for k, ref in self.refs.items() if self.register[k] == r}


def cast():
    return json.loads(Path("data/narration/voices.json").read_text())["voices"]
