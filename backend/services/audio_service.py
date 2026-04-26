"""Audio processing service — waveform, beat detection, EQ, noise reduction, sync, amix."""
from __future__ import annotations

import math
import os
import tempfile
from typing import Optional

import ffmpeg
import librosa
import numpy as np


def extract_waveform(file_path: str, n_points: int = 200) -> list[float]:
    """Load audio file and return normalized RMS amplitude array of length n_points."""
    y, sr = librosa.load(file_path, mono=True, sr=None)
    if len(y) == 0:
        return [0.0] * n_points
    hop = max(1, len(y) // n_points)
    amplitudes: list[float] = []
    for i in range(n_points):
        segment = y[i * hop : (i + 1) * hop]
        amplitudes.append(float(np.sqrt(np.mean(segment ** 2))) if len(segment) > 0 else 0.0)
    max_amp = max(amplitudes) or 1.0
    return [a / max_amp for a in amplitudes]


def detect_beats(file_path: str) -> list[float]:
    """Return beat timestamps in seconds using librosa beat tracking."""
    y, sr = librosa.load(file_path, mono=True, sr=None)
    _, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    return [float(t) for t in beat_times]


def sync_audio_to_duration(input_path: str, output_path: str, target_duration: float) -> str:
    """Trim or loop audio file to exactly target_duration seconds."""
    info = ffmpeg.probe(input_path)
    audio_duration = float(info["format"]["duration"])
    audio_stream = next((s for s in info["streams"] if s.get("codec_type") == "audio"), {})
    sample_rate = int(audio_stream.get("sample_rate", 44100))

    if audio_duration >= target_duration:
        (
            ffmpeg
            .input(input_path, t=target_duration)
            .output(output_path, acodec="pcm_s16le")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    else:
        n_samples = int(audio_duration * sample_rate)
        loops = math.ceil(target_duration / audio_duration)
        (
            ffmpeg
            .input(input_path)
            .filter("aloop", loop=loops, size=n_samples)
            .filter("atrim", duration=target_duration)
            .output(output_path, acodec="pcm_s16le")
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
    return output_path


def mix_audio_into_video(
    video_path: str,
    output_path: str,
    tracks: list[dict],
    eq: Optional[dict] = None,
    noise_reduction_strength: float = 0.0,
) -> str:
    """Mix additional audio tracks into a video file.

    tracks: list of {stored_path: str, volume: float, offset: float}
    eq: {bass, mid, presence, treble} each -12 to +12 dB
    noise_reduction_strength: 0.0-1.0
    """
    video_in = ffmpeg.input(video_path)
    audio_streams = [video_in.audio]

    for track in tracks:
        a = ffmpeg.input(track["stored_path"]).audio
        if track.get("offset", 0) > 0:
            delay_ms = int(track["offset"] * 1000)
            a = a.filter("adelay", f"{delay_ms}|{delay_ms}")
        if track.get("volume", 1.0) != 1.0:
            a = a.filter("volume", track["volume"])
        audio_streams.append(a)

    if len(audio_streams) > 1:
        mixed = ffmpeg.filter(audio_streams, "amix", inputs=len(audio_streams), normalize=0)
    else:
        mixed = audio_streams[0]

    if noise_reduction_strength > 0:
        s_param = max(0.00001, min(10.0, 10 ** (noise_reduction_strength * 4 - 4)))
        mixed = mixed.filter("anlmdn", s=s_param)

    if eq:
        if eq.get("bass", 0) != 0:
            mixed = mixed.filter("equalizer", frequency=80, width_type="o", width=2, gain=eq["bass"])
        if eq.get("mid", 0) != 0:
            mixed = mixed.filter("equalizer", frequency=1000, width_type="o", width=2, gain=eq["mid"])
        if eq.get("presence", 0) != 0:
            mixed = mixed.filter("equalizer", frequency=4000, width_type="o", width=2, gain=eq["presence"])
        if eq.get("treble", 0) != 0:
            mixed = mixed.filter("equalizer", frequency=8000, width_type="o", width=2, gain=eq["treble"])

    (
        ffmpeg
        .output(video_in.video, mixed, output_path, vcodec="copy", acodec="aac")
        .overwrite_output()
        .run(capture_stdout=True, capture_stderr=True)
    )
    return output_path
