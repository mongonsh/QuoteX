#!/usr/bin/env python3

import os
import struct
import subprocess
import sys
import time
import wave
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_DIR = PROJECT_ROOT / ".runtime" / "demo"
SEGMENT_DIR = RUNTIME_DIR / "motion-narration-segments"
OUTPUT_PATH = RUNTIME_DIR / "QuoteX-motion-narration-soft.wav"
FFMPEG_PATH = PROJECT_ROOT / "node_modules" / "ffmpeg-static" / "ffmpeg"
DURATION_SECONDS = 102.4

MODEL = "cosyvoice-v3-flash"
VOICE = "longwan_v3"
DEFAULT_WEBSOCKET_URL = "wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference"

SEGMENTS = [
    (
        0.65,
        "A Berlin buyer requests five hundred Mongolian cashmere scarves with packaging and origin "
        "documents. QuoteX turns voice and photo into reviewable work.",
    ),
    (
        12.95,
        "Qwen three point seven plans the workflow. It selects six typed skills for catalog, "
        "memory, shipping, pricing, risk, and approval. Verified TypeScript tools execute every "
        "commercial fact inside a bounded loop.",
    ),
    (
        28.35,
        "Each turn exposes arguments, results, latency, and a tamper-evident "
        "digest. Governed QuoteX passed forty-two of forty-two adversarial checks. The one-prompt "
        "baseline passed twenty-eight.",
    ),
    (
        43.05,
        "Trusted tools verify quantity, DHL Economy freight, Net thirty, and margin. The offer "
        "stops for human approval.",
    ),
    (
        55.05,
        "The approved cashmere record grounds Qwen image editing and HappyHorse video. Sources "
        "stay traceable, assets stay labeled, and outputs remain drafts.",
    ),
    (
        67.0,
        "QuoteX creates eBay, Amazon, and Alibaba dot com drafts with wholesale rules. Nothing "
        "auto-publishes.",
    ),
    (
        76.65,
        "Customers ask by voice. Qwen speech recognition captures the question. Qwen answers "
        "from approved context. CosyVoice responds.",
    ),
    (
        87.0,
        "On timeout, trusted tools recover visibly while human approval stays locked.",
    ),
    (
        95.0,
        "Qwen plans, verified tools decide, and a human controls the action.",
    ),
]


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip().strip("'\"")
        if name and name not in os.environ:
            os.environ[name] = value


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


def normalize_wav_container(audio: bytes) -> bytes:
    if len(audio) < 44 or audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
        return audio

    normalized = bytearray(audio)
    struct.pack_into("<I", normalized, 4, len(normalized) - 8)
    offset = 12
    while offset + 8 <= len(normalized):
        chunk_id = normalized[offset : offset + 4]
        declared_size = struct.unpack_from("<I", normalized, offset + 4)[0]
        if chunk_id == b"data":
            struct.pack_into("<I", normalized, offset + 4, len(normalized) - offset - 8)
            break
        next_offset = offset + 8 + declared_size + (declared_size % 2)
        if next_offset <= offset or next_offset > len(normalized):
            break
        offset = next_offset
    return bytes(normalized)


def synthesize_segments(force: bool) -> list[tuple[Path, float, float]]:
    load_dotenv(PROJECT_ROOT / ".env")
    api_key = (
        os.environ.get("DASHSCOPE_API_KEY")
        or os.environ.get("QWEN_TTS_API_KEY")
        or os.environ.get("QWEN_API_KEY")
    )
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY or QWEN_API_KEY is required in .env")

    import dashscope
    import certifi
    from dashscope.audio.tts_v2 import AudioFormat, SpeechSynthesizer

    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    websocket_url = os.environ.get(
        "QWEN_COSYVOICE_WEBSOCKET_URL", DEFAULT_WEBSOCKET_URL
    )
    dashscope.api_key = api_key
    dashscope.base_websocket_api_url = websocket_url
    SEGMENT_DIR.mkdir(parents=True, exist_ok=True)

    generated = []
    for index, (start, text) in enumerate(SEGMENTS, start=1):
        path = SEGMENT_DIR / f"scene-{index:02d}.wav"
        if force or not path.exists() or path.stat().st_size == 0:
            for attempt in range(1, 4):
                try:
                    synthesizer = SpeechSynthesizer(
                        model=MODEL,
                        voice=VOICE,
                        format=AudioFormat.WAV_48000HZ_MONO_16BIT,
                        volume=56,
                        speech_rate=0.94,
                        pitch_rate=0.98,
                        seed=7300 + index,
                        language_hints=["en"],
                    )
                    audio = normalize_wav_container(
                        synthesizer.call(text, timeout_millis=90_000)
                    )
                    if not audio or not audio.startswith(b"RIFF"):
                        raise RuntimeError("CosyVoice returned empty or invalid WAV audio")
                    path.write_bytes(audio)
                    print(
                        f"Generated scene {index:02d}: "
                        f"{synthesizer.get_last_request_id()} "
                        f"({synthesizer.get_first_package_delay()} ms first packet)"
                    )
                    break
                except Exception:
                    if attempt == 3:
                        raise
                    time.sleep(attempt * 1.5)

        duration = wav_duration(path)
        next_start = (
            SEGMENTS[index][0] if index < len(SEGMENTS) else DURATION_SECONDS
        )
        available = next_start - start
        if duration > available:
            raise RuntimeError(
                f"Scene {index:02d} narration is {duration:.2f}s but only "
                f"{available:.2f}s is available. Shorten the text before mixing."
            )
        generated.append((path, start, duration))
        print(
            f"Scene {index:02d}: start={start:05.2f}s duration={duration:05.2f}s "
            f"headroom={available - duration:04.2f}s"
        )
    return generated


def mix_timeline(segments: list[tuple[Path, float, float]]) -> None:
    if not FFMPEG_PATH.exists():
        raise RuntimeError("ffmpeg-static is missing. Run npm install first.")

    filters = []
    labels = []
    for index, (_, start, duration) in enumerate(segments):
        fade_out_start = max(0.05, duration - 0.12)
        delay_ms = round(start * 1000)
        label = f"voice{index}"
        filters.append(
            f"[{index}:a]aresample=48000,"
            "aformat=sample_fmts=fltp:channel_layouts=mono,"
            "highpass=f=72,lowpass=f=15500,"
            "afade=t=in:st=0:d=0.045,"
            f"afade=t=out:st={fade_out_start:.3f}:d=0.12,"
            f"adelay=delays={delay_ms}:all=1[{label}]"
        )
        labels.append(f"[{label}]")

    filters.append(
        f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:normalize=0,"
        "acompressor=threshold=0.12:ratio=1.7:attack=18:release=180:makeup=1.08,"
        f"apad=pad_dur={DURATION_SECONDS},atrim=duration={DURATION_SECONDS},"
        "loudnorm=I=-18:TP=-2.5:LRA=7[out]"
    )

    command = [str(FFMPEG_PATH), "-hide_banner", "-y"]
    for path, _, _ in segments:
        command.extend(["-i", str(path)])
    command.extend(
        [
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[out]",
            "-ar",
            "48000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            str(OUTPUT_PATH),
        ]
    )
    subprocess.run(command, check=True)
    print(f"Wrote soft narration timeline: {OUTPUT_PATH}")


def main() -> None:
    force = "--force" in sys.argv
    segments = synthesize_segments(force=force)
    mix_timeline(segments)


if __name__ == "__main__":
    main()
