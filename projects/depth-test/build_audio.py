"""Build the editable stems and mix for the Depth Test pilot."""

import argparse
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice, SynthesisConfig


PROJECT = Path(__file__).resolve().parent
ROOT = PROJECT.parents[1]
CACHE = ROOT / ".cache" / "depth-test" / "audio"
OUTPUT = ROOT / "public" / "depth-test" / "audio"
LOUDNESS_TOOL = ROOT / ".agents" / "skills" / "ffmpeg-skill" / "scripts" / "loudness.py"
SAMPLE_RATE = 48000
DURATION = 28
LINES = (
    ("hook", 0.25, 2.92, "اگه سَطحِ دورتر آخِر رَسم بشه، کدوم دیده می‌شِ؟"),
    ("reveal", 3.50, 7.60, "از کنار نگاه کن. فیروزه‌ای نزدیک‌تره. کَهرُبایی پُشتِشِ."),
    ("rule", 8.10, 12.80, "برای همین نُقطه، عُمقِ هر سَطح با عددِ ذخیره‌شده مقایسه می‌شِ."),
    ("near-first", 13.10, 17.20, "نزدیک اوّل میاد. سَطحِ دور عُمقِ بیشتری داره و رَد می‌شِ."),
    ("far-first", 18.00, 22.65, "حالا بَرعَکس. نزدیک دیرتر میاد، ولی عددِ کوچیک‌تر رو جایگزین می‌کنه."),
    ("answer", 23.30, 27.35, "توی این مِثال، هر دو بار سَطحِ نزدیک‌تر می‌مونه."),
)


def write_wav(path, samples):
    if samples.ndim == 1:
        samples = samples[:, None]
    pcm = np.rint(np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(pcm.shape[1])
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())


def read_narration(path):
    with wave.open(str(path), "rb") as source:
        if (source.getnchannels(), source.getsampwidth(), source.getframerate(), source.getnframes()) != (
            2, 2, SAMPLE_RATE, SAMPLE_RATE * DURATION,
        ):
            raise ValueError("Replacement narration must be 28 s, 48 kHz, stereo PCM16 WAV")
        return np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").reshape(-1, 2) / 32767


def voice_line(voice, text, length_scale):
    chunks = list(voice.synthesize(
        text, syn_config=SynthesisConfig(length_scale=length_scale, noise_scale=0.56, noise_w_scale=0.62),
    ))
    samples = []
    for chunk in chunks:
        raw = chunk.audio_float_array
        active = np.flatnonzero(np.abs(raw) > 0.009)
        if not len(active):
            raise RuntimeError("Piper produced an empty phrase")
        # Retain low-level consonants surrounding voiced material.
        start = max(0, active[0] - round(chunk.sample_rate * 0.035))
        end = min(len(raw), active[-1] + round(chunk.sample_rate * 0.060))
        raw = raw[start:end]
        source_index = np.arange(round(len(raw) * SAMPLE_RATE / chunk.sample_rate)) * chunk.sample_rate / SAMPLE_RATE
        converted = np.interp(source_index, np.arange(len(raw)), raw)
        fade = min(len(converted) // 2, round(SAMPLE_RATE * 0.012))
        converted[:fade] *= np.linspace(0, 1, fade)
        converted[-fade:] *= np.linspace(1, 0, fade)
        if samples:
            samples.append(np.zeros(round(SAMPLE_RATE * 0.13)))
        samples.append(converted)
    return np.concatenate(samples)


def read_phrase(path):
    with wave.open(str(path), "rb") as source:
        return np.frombuffer(source.readframes(source.getnframes()), dtype="<i2") / 32767


def build_narration(voice, only):
    narration = np.zeros(SAMPLE_RATE * DURATION)
    timings = []
    existing_timings = json.loads((OUTPUT / "timings.json").read_text(encoding="utf-8")) if only else []
    previous_scales = {timing["id"]: timing["lengthScale"] for timing in existing_timings}
    for line_id, start, latest, text in LINES:
        path = OUTPUT / f"voice-{line_id}.wav"
        if only and line_id not in only:
            samples = read_phrase(path)
            length_scale = previous_scales[line_id]
        else:
            length_scale = previous_scales.get(line_id, 0.95)
            samples = voice_line(voice, text, length_scale)
            for _ in range(3):
                if len(samples) <= round((latest - start) * SAMPLE_RATE):
                    break
                length_scale *= 0.96 * (latest - start) * SAMPLE_RATE / len(samples)
                samples = voice_line(voice, text, length_scale)
            write_wav(path, samples)
        end = start + len(samples) / SAMPLE_RATE
        if end > latest:
            raise RuntimeError(f"{line_id} ends at {end:.2f}s, after {latest:.2f}s")
        offset = round(start * SAMPLE_RATE)
        narration[offset:offset + len(samples)] = samples * 0.5
        timings.append({"id": line_id, "start": start, "end": round(end, 3), "lengthScale": round(length_scale, 3)})
    return np.repeat(narration[:, None], 2, axis=1), timings


def build_ambience():
    rng = np.random.default_rng(271)
    t = np.arange(SAMPLE_RATE * DURATION) / SAMPLE_RATE
    fade = np.minimum(np.minimum(1, t * 2), (DURATION - t) * 2)
    room = (0.005 * np.sin(2 * np.pi * t * 111 + 0.3 * np.sin(t)) +
            0.003 * np.sin(2 * np.pi * t * 167 + 0.22 * np.sin(t * 1.4)))
    room += np.interp(t, np.arange(0, DURATION + 0.01, 0.01), rng.normal(0, 0.0012, 2801))
    stem = np.column_stack((room * fade, room * fade))

    def place(start, sound, pan=0):
        offset = round(start * SAMPLE_RATE)
        stem[offset:offset + len(sound), 0] += sound * (1 - pan * 0.35)
        stem[offset:offset + len(sound), 1] += sound * (1 + pan * 0.35)

    t = np.arange(round(1.75 * SAMPLE_RATE)) / SAMPLE_RATE
    swipe = rng.normal(0, 1, len(t))
    swipe = np.convolve(swipe, np.ones(32) / 32, "same") - np.convolve(swipe, np.ones(140) / 140, "same")
    place(3.00, 0.043 * swipe * np.sin(np.pi * t / 1.75) ** 2, -0.5)

    def click(at, gain, pitch, pan=0):
        t = np.arange(round(0.25 * SAMPLE_RATE)) / SAMPLE_RATE
        resonance = np.sin(2 * np.pi * pitch * t) + 0.43 * np.sin(2 * np.pi * pitch * 2.09 * t)
        transient = rng.normal(0, 1, len(t)) * np.exp(-t * 155)
        envelope = (1 - np.exp(-t * 500)) * np.exp(-t * 34)
        place(at, gain * (resonance + 0.38 * transient) * envelope, pan)

    click(8.00, 0.034, 510)
    click(13.70, 0.040, 440, -0.4)
    click(15.65, 0.035, 220, 0.4)
    click(18.55, 0.040, 262, 0.4)
    click(20.55, 0.042, 440, -0.4)
    t = np.arange(round(1.1 * SAMPLE_RATE)) / SAMPLE_RATE
    place(23.00, 0.010 * (np.sin(2 * np.pi * 220 * t) + 0.65 * np.sin(2 * np.pi * 330 * t)) *
          (1 - np.exp(-t * 30)) * np.exp(-t * 4))
    return stem


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--model", type=Path, help="Piper fa_IR-amir-medium.onnx")
    source.add_argument("--narration", type=Path, help="Existing 28 s stereo narration WAV")
    parser.add_argument("--only", nargs="+", choices=[line[0] for line in LINES],
                        help="With --model, reuse the previous voice files for the other sentences")
    args = parser.parse_args()
    if args.only and not args.model:
        parser.error("--only requires --model")
    CACHE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if args.model:
        narration, timings = build_narration(PiperVoice.load(args.model), args.only)
        write_wav(OUTPUT / "narration.wav", narration)
        (OUTPUT / "timings.json").write_text(json.dumps(timings, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(timings))
    else:
        narration = read_narration(args.narration)
    foley = build_ambience()
    write_wav(OUTPUT / "ambience-foley.wav", foley)
    raw = CACHE / "mix-pre-normalization.wav"
    write_wav(raw, narration + foley)
    subprocess.run([
        sys.executable, str(LOUDNESS_TOOL), str(raw), "-I", "-14", "--tp", "-2",
        "--sample-rate", str(SAMPLE_RATE), "--overwrite", "-o", str(OUTPUT / "mix.wav"),
    ], check=True)


if __name__ == "__main__":
    main()
