import { useRef, useEffect, useState } from "react";
import { useAudioStore } from "../../stores/audioStore";
import { audioImport, audioBeats } from "../../api/client";
import type { AudioTrack as AudioTrackType, BeatMarker } from "../../types";

const TRACK_HEIGHT = 56;

function WaveformCanvas({ waveform }: { waveform: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveform.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(233,69,96,0.6)";

    const barW = width / waveform.length;
    waveform.forEach((v, i) => {
      const barH = Math.max(2, v * height);
      const y = (height - barH) / 2;
      ctx.fillRect(i * barW, y, Math.max(1, barW - 0.5), barH);
    });
  }, [waveform]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={TRACK_HEIGHT - 8}
      style={{ flex: 1, height: TRACK_HEIGHT - 8, display: "block" }}
    />
  );
}

function TrackItem({ track }: { track: AudioTrackType }) {
  const { updateTrack, removeTrack, setBeatMarkers } = useAudioStore();
  const [loadingBeats, setLoadingBeats] = useState(false);

  const handleBeats = async () => {
    setLoadingBeats(true);
    try {
      const res = await audioBeats(track.id);
      const beats: BeatMarker[] = (res.data.beats as number[]).map((t, i) => ({
        id: `beat_${i}`,
        time: t,
        strength: 0.8,
      }));
      setBeatMarkers(beats);
    } catch {
      // silently ignore
    } finally {
      setLoadingBeats(false);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        minWidth: 200,
        height: TRACK_HEIGHT - 8,
        background: "rgba(233,69,96,0.08)",
        border: "1px solid rgba(233,69,96,0.3)",
        borderRadius: 4,
        overflow: "hidden",
        opacity: track.muted ? 0.4 : 1,
        gap: 6,
        padding: "0 6px",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 80,
        }}
      >
        {track.name}
      </span>

      {track.waveform && <WaveformCanvas waveform={track.waveform} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
        <button
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
          style={{
            fontSize: 9,
            padding: "1px 5px",
            borderRadius: 2,
            border: "1px solid var(--border)",
            background: track.muted ? "var(--accent)" : "var(--bg-tertiary)",
            color: track.muted ? "#fff" : "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          {track.muted ? "Unmute" : "Mute"}
        </button>
        <button
          onClick={handleBeats}
          disabled={loadingBeats}
          style={{
            fontSize: 9,
            padding: "1px 5px",
            borderRadius: 2,
            border: "1px solid var(--border)",
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            cursor: loadingBeats ? "not-allowed" : "pointer",
          }}
        >
          {loadingBeats ? "…" : "Beats"}
        </button>
        <button
          onClick={() => removeTrack(track.id)}
          style={{
            fontSize: 9,
            padding: "1px 5px",
            borderRadius: 2,
            border: "1px solid var(--border)",
            background: "var(--bg-tertiary)",
            color: "#f87171",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function AudioTrack({ totalW }: { totalW: number }) {
  const { tracks, addTrack, beatMarkers } = useAudioStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const importFiles = async (files: File[]) => {
    const audioFiles = files.filter(
      (f) => f.type.startsWith("audio/") || /\.(mp3|wav|aac|ogg|flac|m4a)$/i.test(f.name)
    );
    if (audioFiles.length === 0) return;
    setImporting(true);
    try {
      for (const file of audioFiles) {
        const res = await audioImport(file, "music");
        const d = res.data;
        addTrack({
          id: d.media_id,
          name: d.filename,
          volume: 1,
          muted: false,
          duration: d.duration,
          waveform: d.waveform,
        });
      }
    } catch {
      // silently ignore upload errors
    } finally {
      setImporting(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    await importFiles(Array.from(e.dataTransfer.files));
  };

  const handleInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await importFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  return (
    <div
      style={{
        display: "flex",
        height: TRACK_HEIGHT,
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Label column */}
      <div
        style={{
          width: 100,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 3,
          padding: "0 10px",
          borderRight: "1px solid var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 13 }}>🔊</span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Audio</span>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={importing}
          style={{
            fontSize: 9,
            padding: "1px 6px",
            borderRadius: 3,
            border: "1px solid var(--border)",
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          {importing ? "…" : "+ Import"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.aac,.ogg,.flac,.m4a"
          multiple
          style={{ display: "none" }}
          onChange={handleInput}
        />
      </div>

      {/* Track region */}
      <div
        style={{
          flex: 1,
          minWidth: totalW,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          overflowX: "auto",
          position: "relative",
        }}
      >
        {tracks.length === 0 ? (
          <span style={{ fontSize: 11, color: "var(--text-secondary)", opacity: 0.5 }}>
            Drop audio files here or click Import
          </span>
        ) : (
          tracks.map((t) => <TrackItem key={t.id} track={t} />)
        )}

        {/* Beat markers overlay */}
        {beatMarkers.map((bm) => (
          <div
            key={bm.id}
            style={{
              position: "absolute",
              left: 8 + bm.time * 80,
              top: 0,
              bottom: 0,
              width: 1,
              background: "rgba(251,191,36,0.6)",
              pointerEvents: "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}
