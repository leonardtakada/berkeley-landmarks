"""Renders walks in the locked voices: each walk's intro, every stop's script in order, its outro.

    python scripts/narration/render_walk.py [tour-id ...] [--all] [--redo part ...] [--out narration-takes]

Each script is spoken once. A stop's narration is shared by every walk it's on, so it renders
to <out>/parts/<landmark>.wav (with <landmark>.json: what it was made from, and each
paragraph's pace) and is reused for as long as its script, its speakers' locked voices and
their pace are unchanged; a walk's intro and outro likewise (<tour>-intro, <tour>-outro).
Seeds come from the part's name, so a stop is the same take on every walk. --redo makes the
parts named again (e.g. lm-16) whatever the cache says.

Each part is spoken paragraph by paragraph, every paragraph cloned from its speaker's
reference (data/narration/voices.json), with the pauses the sound design sets: 0.45 s between
paragraphs, 0.7 s where the speaker changes. Each paragraph is brought to the same speech
level, so the guide and the architects sit together. A take that runs on or rushes (under 90
words a minute, or 45% over its voice's target pace) is made again with the next seed, up to
twice, keeping the nearest to pace; lines under 15 words are let be, since a short line always
measures fast. Then each paragraph is slowed to its voice's brief pace (the voices read 10–30%
quicker than asked), by WSOLA, which keeps the pitch: never sped up, and never slowed by more
than 28%.

For each walk: <out>/walks/<tour>/parts.json (its parts in order, where each one's audio is)
and <tour>-whole.wav, the whole walk to listen to as the guide will play it (the design
canvas's "A stop, start to finish"), with the guide's sounds (sounds.py): the intro while it
finds you, then Found you; at each stop the "At the door" chime, the stamp a second later, the
door held 7 s, then the narration 0.4 s after its screen (after the handover swish and the
guest's bell when another drawn architect tells it), On you go 1.5 s after the last word; the
Walked stamp and bells, then the outro. The walking between stops is cut to 2 s.
Use the same Python as design_takes.py, with audiotsm (pip install audiotsm); about real time
on an M3 Ultra.
"""
import argparse
import hashlib
import json
import re
import subprocess
import time
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from audiotsm import wsola
from audiotsm.io.array import ArrayReader, ArrayWriter
from qwen_tts import Qwen3TTSModel

import sounds

SR = 24000
GAP_PARAGRAPH = 0.45
GAP_SPEAKER = 0.7
# The stop's timeline, from the door (the design canvas's "A stop, start to finish").
STAMP_AT = 1.0
DOOR_HOLDS = 7.0
HANDOVER_SCREEN = 4.5  # the handover's length before the guest's own screen
VOICE_AFTER_SCREEN = 0.4
ON_YOU_GO_AFTER = 1.5
WALKING = 2.0  # the walk between stops, cut short for listening
# The architects drawn in the firmware so far (device/main/ui/data.c): only they hand over.
DRAWN = {"ratcliff", "plachek", "maybeck", "morgan"}
SPEECH_RMS = 10 ** (-20 / 20)  # every paragraph's speech brought to −20 dBFS RMS
PEAK = 10 ** (-1 / 20)
SLOWEST = 0.72  # stretched further than this, WSOLA starts to sound smeared

ap = argparse.ArgumentParser()
ap.add_argument("tours", nargs="*", help="tour ids (default tour-downtown)")
ap.add_argument("--all", action="store_true", help="every walk")
ap.add_argument("--redo", nargs="*", default=[], help="parts to make again, e.g. lm-16 tour-downtown-intro")
ap.add_argument("--out", default="narration-takes")
a = ap.parse_args()

voices = json.loads(Path("data/narration/voices.json").read_text())["voices"]
tours = json.loads(subprocess.check_output(
    ["npx", "tsx", "-e", "import { tours } from './data/tours'; import { architectsOnTour } from './lib/architects'; "
     "console.log(JSON.stringify(tours.map(t => { const { lead, cast } = architectsOnTour(t); return "
     "({ id: t.id, host: lead ?? cast[0] ?? null, stops: [...t.stops].sort((x, y) => x.order - y.order).map(s => s.landmarkId) }); })))"],
    stderr=subprocess.DEVNULL).decode().strip().splitlines()[-1])
wanted = [t for t in tours if a.all or t["id"] in (a.tours or ["tour-downtown"])]
PARTS = Path(a.out) / "parts"
WALKS = Path(a.out) / "walks"
PARTS.mkdir(parents=True, exist_ok=True)


def sections(path):
    """The script's (speaker, paragraphs) in order."""
    body = re.sub(r"^---[\s\S]*?---\s*", "", Path(path).read_text())
    out = []
    for speaker, text in re.findall(r"^## (\w+)\s*\n([\s\S]*?)(?=^## |\Z)", body, re.M):
        paras = [" ".join(p.split()) for p in re.split(r"\n\s*\n", text) if p.strip()]
        out.append((speaker, paras))
    return out


def made_from(secs):
    """What a part's audio depends on: its script, and each speaker's locked voice and pace."""
    speakers = sorted({s for s, _ in secs})
    key = json.dumps([secs, [[s, voices[s]["voice"], voices[s]["target"]["wpm"]] for s in speakers]], sort_keys=True)
    return hashlib.sha1(key.encode()).hexdigest()


def walk_parts(tour):
    """A walk's parts in order: (part id, sections)."""
    w = dict(sections(f"data/narration/walks/{tour['id']}.md"))
    parts = [(f"{tour['id']}-intro", [("guide", w["intro"])])]
    parts += [(lm, sections(f"data/narration/stops/{lm}.md")) for lm in tour["stops"]]
    parts.append((f"{tour['id']}-outro", [("guide", w["outro"])]))
    return parts


def cached(pid, secs):
    meta = PARTS / f"{pid}.json"
    if pid in a.redo or not meta.exists() or not (PARTS / f"{pid}.wav").exists():
        return None
    m = json.loads(meta.read_text())
    return m if m.get("made_from") == made_from(secs) else None


tts = None
prompts = {}
slowed = {}  # each voice's slowings so far, for its short lines


def model():
    global tts
    if tts is None:
        t0 = time.time()
        tts = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map="mps", dtype=torch.bfloat16)
        print(f"loaded in {time.time() - t0:.0f} s", flush=True)
    return tts


def prompt_for(speaker):
    if speaker not in prompts:
        v = voices[speaker]
        prompts[speaker] = model().create_voice_clone_prompt(ref_audio=v["voice"]["reference"], ref_text=v["line"])
    return prompts[speaker]


def level(y):
    """Trim the silence round a paragraph, fade its ends, and bring its speech to SPEECH_RMS."""
    y, _ = librosa.effects.trim(y, top_db=40)
    fade = int(0.03 * SR)
    y = y.copy()
    y[:fade] *= np.linspace(0, 1, fade)
    y[-fade:] *= np.linspace(1, 0, fade)
    frames = librosa.util.frame(np.pad(y, (0, 1024)), frame_length=1024, hop_length=512)
    rms = np.sqrt(np.mean(frames ** 2, axis=0))
    speech = rms[rms > rms.max() * 0.1]
    gain = SPEECH_RMS / max(float(np.sqrt(np.mean(speech ** 2))), 1e-6)
    y = y * gain
    peak = float(np.max(np.abs(y)))
    return y * (PEAK / peak) if peak > PEAK else y


def speak(speaker, text, seed):
    words = len(text.split())
    target = voices[speaker]["target"]["wpm"]
    tries = []
    for attempt in range(3):
        torch.manual_seed(seed + 1000 * attempt)
        wavs, sr = model().generate_voice_clone(text=text, language="English", voice_clone_prompt=prompt_for(speaker))
        y = librosa.resample(wavs[0], orig_sr=sr, target_sr=SR) if sr != SR else wavs[0]
        y = level(y)
        wpm = words / (len(y) / SR) * 60
        # A line of a few words has no pauses and always reads fast: only longer ones are held to pace.
        if words < 15 or 90 <= wpm <= target * 1.45:
            return y, wpm
        tries.append((abs(wpm - target), y, wpm))
        print(f"    {speaker}: {wpm:.0f} words a minute, making it again", flush=True)
    _, y, wpm = min(tries, key=lambda t: t[0])
    return y, wpm


def stretch(y, speed):
    """Slows speech by WSOLA without moving its pitch: speed 0.8 makes it 25% longer."""
    reader, writer = ArrayReader(y[np.newaxis, :].astype(np.float32)), ArrayWriter(1)
    wsola(1, speed=speed).run(reader, writer)
    return writer.data[0]


def pace(speaker, y, words, wpm):
    """Brings a paragraph to its voice's brief pace: never faster, and not past SLOWEST.
    A line under 15 words always measures fast, so it takes the slowing of the voice's longer lines."""
    target = voices[speaker]["target"]["wpm"]
    if words >= 15:
        speed = max(SLOWEST, min(1.0, target / wpm))
        slowed.setdefault(speaker, []).append(speed)
    else:
        speed = float(np.median(slowed[speaker])) if slowed.get(speaker) else 1.0
    if speed < 0.995:
        y = level(stretch(y, speed))
    return y, words / (len(y) / SR) * 60


def silence(s):
    return np.zeros(int(s * SR), dtype=np.float32)


def render(pid, secs):
    """A part's audio: from the cache if it still holds, else spoken now and cached."""
    m = cached(pid, secs)
    if m:
        return m
    t = time.time()
    seed = int(hashlib.sha1(pid.encode()).hexdigest()[:6], 16)
    audio, info, last = [], [], None
    for speaker, paras in secs:
        for p in paras:
            if audio:
                audio.append(silence(GAP_SPEAKER if speaker != last else GAP_PARAGRAPH))
            y, spoken = speak(speaker, p, seed=seed + len(info))
            y, wpm = pace(speaker, y, len(p.split()), spoken)
            audio.append(y)
            info.append({"speaker": speaker, "words": len(p.split()), "seconds": round(len(y) / SR, 1),
                         "wpm": round(wpm), "wpm_spoken": round(spoken)})
            last = speaker
    y = np.concatenate(audio)
    sf.write(PARTS / f"{pid}.wav", y, SR)
    m = {"part": pid, "made_from": made_from(secs), "seconds": round(len(y) / SR, 1), "paragraphs": info}
    (PARTS / f"{pid}.json").write_text(json.dumps(m, indent=2))
    print(f"  {pid}: {len(y) / SR:.0f} s of audio in {time.time() - t:.0f} s", flush=True)
    return m


class Mix:
    """A whole walk laid out in time: voices and sounds placed at their moments, then summed."""

    def __init__(self):
        self.events = []  # (start, audio, what)

    def put(self, at, y, what):
        """Places `y` at `at` seconds; returns when it ends."""
        self.events.append((at, y, what))
        return at + len(y) / SR

    def audio(self):
        end = max(at + len(y) / SR for at, y, _ in self.events)
        out = np.zeros(int(end * SR) + 1, dtype=np.float32)
        for at, y, _ in self.events:
            i = int(round(at * SR))
            out[i:i + len(y)] += y
        peak = float(np.max(np.abs(out)))
        return out * (PEAK / peak) if peak > PEAK else out

    def timeline(self):
        return [{"at": round(at, 1), "what": what} for at, _, what in sorted(self.events, key=lambda e: e[0])]


for tour in wanted:
    t0 = time.time()
    folder = WALKS / tour["id"]
    folder.mkdir(parents=True, exist_ok=True)
    parts = walk_parts(tour)
    manifest = [{**render(pid, secs), "file": str(PARTS / f"{pid}.wav")} for pid, secs in parts]
    audio = {pid: sf.read(PARTS / f"{pid}.wav", dtype="float32")[0] for pid, _ in parts}
    (intro, _), stops, (outro, _) = parts[0], parts[1:-1], parts[-1]

    mix = Mix()
    t = mix.put(0, audio[intro], "the introduction, while it finds you")
    t = mix.put(t + 1.0, sounds.found_you(), "Found you")
    for i, (pid, secs) in enumerate(stops):
        door = t + WALKING
        mix.put(door, sounds.at_the_door(), f"stop {i + 1}: at the door")
        mix.put(door + STAMP_AT, sounds.stamp(), "the stamp")
        speaker, screen = secs[0][0], door + DOOR_HOLDS
        if speaker in DRAWN and speaker != tour["host"]:
            mix.put(screen, sounds.handing_over(speaker), f"handing over to {voices[speaker]['name']}")
            screen += HANDOVER_SCREEN
        end = mix.put(screen + VOICE_AFTER_SCREEN, audio[pid], f"stop {i + 1}: the narration ({pid})")
        t = mix.put(end + ON_YOU_GO_AFTER, sounds.on_you_go(), "On you go") if i < len(stops) - 1 else end
    t = mix.put(t + ON_YOU_GO_AFTER, sounds.walked(), "Walked: the stamp and the bells")
    mix.put(t + 1.0, audio[outro], "the end of the walk")

    whole = mix.audio()
    sf.write(folder / f"{tour['id']}-whole.wav", whole, SR)
    (folder / "parts.json").write_text(json.dumps(manifest, indent=2))
    (folder / "timeline.json").write_text(json.dumps(mix.timeline(), indent=2))
    print(f"{tour['id']}: {len(whole) / SR / 60:.1f} min ({time.time() - t0:.0f} s)", flush=True)
