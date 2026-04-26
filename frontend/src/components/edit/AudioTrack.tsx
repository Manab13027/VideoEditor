import { useRef, useEffect, useState, useCallback } from "react";
import { useAudioStore } from "../../stores/audioStore";
import { audioImport, audioBeats } from "../../api/client";
import type { AudioTrack as AudioTrackType, BeatMarker } from "../../types";

const TRACK_HEIGHT = 56;

function WaveformCanvas({ waveform, width }: { waveform: number[]; width: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveform.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(233,69,96,0.7)";
    const barW = w / waveform.length;
    waveform.forEach((v, i) => {
      const barH = Math.max(2, v * h);
      ctx.fillRect(i * barW, (h - barH) / 2, Math.max(1, barW - 0.5), barH);
    });
  }, [waveform, width]);

  return (
    <canvas
      ref={canvasRef}
      width={Math.max(4, width)}
      height={TRACK_HEIGHT - 16}
      style={{ flex: 1, height: TRACK_HEIGHT - 16, display: "block" }}
    />
  );
}

type DragState = {
  type: "move" | "resize-right" | "resize-left";
  startX: number;
  startTimeStart: number;
  startTrimStart: number;
  startTrimEnd: number;
};

function AudioBlock({
  track,
  PX_PER_SEC,
  onUpdate,
  onRemove,
  onRepeat,
  onBeats,
  loadingBeats,
}: {
  track: AudioTrackType;
  PX_PER_SEC: number;
  onUpdate: (patch: Partial<AudioTrackType>) => void;
  onRemove: () => void;
  onRepeat: () => void;
  onBeats: () => void;
  loadingBeats: boolean;
}) {
  const timeStart = track.time_start ?? 0;
  const trimStart = track.trim_start ?? 0;
  const trimEnd = track.trim_end ?? track.duration;
  const effectiveDuration = Math.max(0.5, trimEnd - trimStart);
  const left = timeStart * PX_PER_SEC;
  const width = Math.max(30, effectiveDuration * PX_PER_SEC);

  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    if (!drag) return;

    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - drag.startX;
      const dt = dx / PX_PER_SEC;
      if (drag.type === "move") {
        onUpdate({ time_start: Math.max(0, drag.startTimeStart + dt) });
      } else if (drag.type === "resize-right") {
        const newTrimEnd = Math.max(drag.startTrimStart + 0.5, drag.startTrimEnd + dt);
        onUpdate({ trim_end: Math.min(newTrimEnd, track.duration) });
      } else {
        // resize-left: shift trim_start and time_start together
        const newTrimStart = Math.max(0, Math.min(drag.startTrimStart + dt, drag.startTrimEnd - 0.5));
        const delta = newTrimStart - drag.startTrimStart;
        const newTimeStart = Math.max(0, drag.startTimeStart + delta);
        onUpdate({ trim_start: newTrimStart, time_start: newTimeStart });
      }
    };

    const handleUp = () => setDrag(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [drag, PX_PER_SEC, onUpdate, track.duration]);

  return (
    <div
      style={{
        position: "absolute",
        left,
        top: 4,
        width,
        height: TRACK_HEIGHT - 8,
        background: "rgba(233,69,96,0.1)",
        border: "1px solid rgba(233,69,96,0.45)",
        borderRadius: 4,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        cursor: drag ? "grabbing" : "grab",
        userSelect: "none",
        opacity: track.muted ? 0.4 : 1,
        overflow: "hidden",
      }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-handle]")) return;
        e.preventDefault();
        setDrag({ type: "move", startX: e.clientX, startTimeStart: timeStart, startTrimStart: trimStart, startTrimEnd: trimEnd });
      }}
    >
      {/* Left resize handle */}
      <div
        data-handle="left"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setDrag({ type: "resize-left", startX: e.clientX, startTimeStart: timeStart, startTrimStart: trimStart, startTrimEnd: trimEnd });
        }}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: "ew-resize",
          background: "rgba(233,69,96,0.5)",
          borderRadius: "4px 0 0 4px",
          zIndex: 4,
          flexShrink: 0,
        }}
        title="Drag to trim start"
      />

      {/* Left label */}
      <div
        style={{
          flexShrink: 0,
          padding: "0 6px 0 10px",
          fontSize: 9,
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 72,
          zIndex: 1,
        }}
      >
        {track.name}
      </div>

      {/* Waveform */}
      {track.waveform && track.waveform.length > 0 && width > 60 && (
        <WaveformCanvas waveform={track.waveform} width={width - 110} />
      )}

      {/* Controls */}
      <div
        style={{ position: "absolute", top: 2, right: 10, display: "flex", gap: 2, zIndex: 3 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onUpdate({ muted: !track.muted })}
          title={track.muted ? "Unmute" : "Mute"}
          style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, border: "1px solid var(--border)", background: track.muted ? "var(--accent)" : "var(--bg-tertiary)", color: track.muted ? "#fff" : "var(--text-secondary)", cursor: "pointer" }}
        >
          M
        </button>
        <button
          onClick={onRepeat}
          title="Loop: add a copy right after this clip"
          style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, border: "1px solid var(--border)", background: "var(--bg-tertiary)", color: "var(--text-secondary)", cursor: "pointer" }}
        >
          ↻
        </button>
        <button
          onClick={onBeats}
          disabled={loadingBeats}
          title="Detect beats"
          style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, border: "1px solid var(--border)", background: "var(--bg-tertiary)", color: "var(--text-secondary)", cursor: loadingBeats ? "not-allowed" : "pointer" }}
        >
          ♩
        </button>
        <button
          onClick={onRemove}
          title="Remove"
          style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, border: "1px solid var(--border)", background: "var(--bg-tertiary)", color: "#f87171", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* Right resize handle */}
      <div
        data-handle="right"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setDrag({ type: "resize-right", startX: e.clientX, startTimeStart: timeStart, startTrimStart: trimStart, startTrimEnd: trimEnd });
        }}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: "ew-resize",
          background: "rgba(233,69,96,0.5)",
          borderRadius: "0 4px 4px 0",
          zIndex: 4,
        }}
        title="Drag to trim end"
      />
    </div>
  );
}

export function AudioTrack({ totalW, PX_PER_SEC }: { totalW: number; PX_PER_SEC: number }) {
  const { tracks, addTrack, updateTrack, removeTrack, setBeatMarkers, beatMarkers, muteOriginalAudio, setMuteOriginalAudio } = useAudioStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [loadingBeatsId, setLoadingBeatsId] = useState<string | null>(null);
  const [dropOverTrackId, setDropOverTrackId] = useState<string | null>(null);
  const [dropOverAdd, setDropOverAdd] = useState(false);

  const importFiles = useCallback(async (files: File[], timeStart?: number) => {
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
          time_start: timeStart ?? 0,
          trim_start: 0,
          trim_end: d.duration,
        });
      }
    } catch {
      // silently ignore
    } finally {
      setImporting(false);
    }
  }, [addTrack]);

  const handleDropOnTrack = async (e: React.DragEvent<HTMLDivElement>, trackRegionEl: HTMLDivElement) => {
    e.preventDefault();
    const rect = trackRegionEl.getBoundingClientRect();
    const dropTime = Math.max(0, (e.clientX - rect.left) / PX_PER_SEC);
    await importFiles(Array.from(e.dataTransfer.files), dropTime);
  };

  const handleInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await importFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handleRepeat = (track: AudioTrackType) => {
    const trimStart = track.trim_start ?? 0;
    const trimEnd = track.trim_end ?? track.duration;
    const effectiveDuration = Math.max(0.5, trimEnd - trimStart);
    addTrack({
      ...track,
      id: `${track.id}_loop_${Date.now()}`,
      time_start: (track.time_start ?? 0) + effectiveDuration,
    });
  };

  const handleBeats = async (trackId: string) => {
    setLoadingBeatsId(trackId);
    try {
      const res = await audioBeats(trackId);
      const beats: BeatMarker[] = (res.data.beats as number[]).map((t, i) => ({
        id: `beat_${i}`,
        time: t,
        strength: 0.8,
      }));
      setBeatMarkers(beats);
    } catch {
      // ignore
    } finally {
      setLoadingBeatsId(null);
    }
  };

  return (
    <div style={{ flexShrink: 0 }}>
      {/* One row per audio track */}
      {tracks.map((track) => {
        const rowRef = { current: null as HTMLDivElement | null };
        return (
          <div
            key={track.id}
            style={{ display: "flex", height: TRACK_HEIGHT, borderBottom: "1px solid var(--border)" }}
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
                gap: 2,
                padding: "0 8px",
                borderRight: "1px solid var(--border)",
                background: "var(--bg-secondary)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11 }}>🔊</span>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 64,
                  }}
                  title={track.name}
                >
                  {track.name}
                </span>
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                <button
                  onClick={() => updateTrack(track.id, { muted: !track.muted })}
                  title={track.muted ? "Unmute" : "Mute"}
                  style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, border: "1px solid var(--border)", background: track.muted ? "var(--accent)" : "var(--bg-tertiary)", color: track.muted ? "#fff" : "var(--text-secondary)", cursor: "pointer" }}
                >
                  M
                </button>
                <button
                  onClick={() => handleRepeat(track)}
                  title="Loop: place a copy immediately after"
                  style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, border: "1px solid var(--border)", background: "var(--bg-tertiary)", color: "var(--text-secondary)", cursor: "pointer" }}
                >
                  ↻
                </button>
                <button
                  onClick={() => removeTrack(track.id)}
                  title="Remove track"
                  style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, border: "1px solid var(--border)", background: "var(--bg-tertiary)", color: "#f87171", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Track region */}
            <div
              ref={(el) => { rowRef.current = el; }}
              style={{
                position: "relative",
                flex: 1,
                minWidth: totalW,
                overflowX: "visible",
                outline: dropOverTrackId === track.id ? "2px dashed var(--accent)" : undefined,
              }}
              onDragOver={(e) => { e.preventDefault(); setDropOverTrackId(track.id); }}
              onDragLeave={() => setDropOverTrackId(null)}
              onDrop={(e) => {
                setDropOverTrackId(null);
                const el = e.currentTarget as HTMLDivElement;
                handleDropOnTrack(e, el);
              }}
            >
              <AudioBlock
                track={track}
                PX_PER_SEC={PX_PER_SEC}
                onUpdate={(patch) => updateTrack(track.id, patch)}
                onRemove={() => removeTrack(track.id)}
                onRepeat={() => handleRepeat(track)}
                onBeats={() => handleBeats(track.id)}
                loadingBeats={loadingBeatsId === track.id}
              />

              {/* Beat markers for this track */}
              {beatMarkers.map((bm) => (
                <div
                  key={bm.id}
                  style={{
                    position: "absolute",
                    left: bm.time * PX_PER_SEC,
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
      })}

      {/* Add audio row */}
      <div style={{ display: "flex", height: TRACK_HEIGHT, borderBottom: "1px solid var(--border)" }}>
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
          <button
            onClick={() => setMuteOriginalAudio(!muteOriginalAudio)}
            title={muteOriginalAudio ? "Original video audio is muted — click to restore" : "Click to mute original video audio"}
            style={{
              fontSize: 9,
              padding: "1px 4px",
              borderRadius: 3,
              border: `1px solid ${muteOriginalAudio ? "var(--accent)" : "var(--border)"}`,
              background: muteOriginalAudio ? "rgba(233,69,96,0.15)" : "var(--bg-tertiary)",
              color: muteOriginalAudio ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {muteOriginalAudio ? "Vid: muted" : "Vid: on"}
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

        {/* Drop zone for new audio */}
        <div
          style={{
            position: "relative",
            flex: 1,
            minWidth: totalW,
            overflowX: "visible",
            outline: dropOverAdd ? "2px dashed var(--accent)" : undefined,
          }}
          onDragOver={(e) => { e.preventDefault(); setDropOverAdd(true); }}
          onDragLeave={() => setDropOverAdd(false)}
          onDrop={(e) => {
            setDropOverAdd(false);
            const el = e.currentTarget as HTMLDivElement;
            handleDropOnTrack(e, el);
          }}
        >
          {tracks.length === 0 && (
            <span
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%,-50%)",
                fontSize: 11,
                color: "var(--text-secondary)",
                opacity: 0.5,
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              Drop audio here or click Import
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
