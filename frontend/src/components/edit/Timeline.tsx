import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { Storyboard } from "./Storyboard";
import { getMediaThumbnailUrl } from "../../api/client";
import { useState, useRef, useEffect } from "react";

const TRACK_HEIGHT = 56;

function clipDuration(clip: { type: string; trim_start: number; trim_end: number | null; duration: number | null }, mediaDuration: number | null): number {
  if (clip.type === "image") return clip.duration ?? 5;
  const end = clip.trim_end ?? mediaDuration ?? 10;
  return Math.max(0.5, end - clip.trim_start);
}

export function Timeline() {
  const { mode, setMode, clips, selectedClipId, selectClip, removeClip } = useTimelineStore();
  const { mediaFiles } = useProjectStore();

  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const totalDuration = sorted.reduce((sum, c) => {
    const media = mediaFiles.find((f) => f.id === c.media_id);
    return sum + clipDuration(c, media?.duration_seconds ?? null);
  }, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <button className={`btn ${mode === "storyboard" ? "btn-primary" : "btn-secondary"}`} style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setMode("storyboard")}>
          Storyboard
        </button>
        <button className={`btn ${mode === "multitrack" ? "btn-primary" : "btn-secondary"}`} style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setMode("multitrack")}>
          Multi-track
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {mode === "storyboard" ? (
          <Storyboard />
        ) : (
          <MultiTrack
            sorted={sorted}
            mediaFiles={mediaFiles}
            selectedClipId={selectedClipId}
            selectClip={selectClip}
            removeClip={removeClip}
            totalDuration={totalDuration}
          />
        )}
      </div>
    </div>
  );
}

const ZOOM_LEVELS = [0.5, 1, 2, 4] as const;

function MultiTrack({
  sorted, mediaFiles, selectedClipId, selectClip, removeClip, totalDuration,
}: {
  sorted: ReturnType<typeof useTimelineStore.getState>["clips"];
  mediaFiles: ReturnType<typeof useProjectStore.getState>["mediaFiles"];
  selectedClipId: string | null;
  selectClip: (id: string | null) => void;
  removeClip: (id: string) => void;
  totalDuration: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const basePxPerSec = Math.max(20, containerW / Math.max(totalDuration, 1));
  const PX_PER_SEC = basePxPerSec * zoom;
  const totalW = Math.max(PX_PER_SEC * totalDuration, containerW);

  const videoClips = sorted.filter((c) => c.type === "video");
  const imageClips = sorted.filter((c) => c.type === "image");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Zoom toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg-secondary)" }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Zoom:</span>
        {ZOOM_LEVELS.map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            style={{
              padding: "2px 8px", fontSize: 11, borderRadius: 3,
              border: `1px solid ${zoom === z ? "var(--accent)" : "var(--border)"}`,
              background: zoom === z ? "rgba(233,69,96,0.12)" : "var(--bg-tertiary)",
              color: zoom === z ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {z === 1 ? "Fit" : `${z}×`}
          </button>
        ))}
      </div>

      {/* Scrollable track area */}
      <div ref={containerRef} style={{ flex: 1, overflowX: "auto", overflowY: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Time ruler */}
        <div style={{ display: "flex", height: 22, flexShrink: 0, position: "relative", minWidth: totalW + 100, paddingLeft: 100, borderBottom: "1px solid var(--border)", background: "var(--bg-primary)" }}>
          {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
            <div key={i} style={{ position: "absolute", left: 100 + i * PX_PER_SEC, top: 0, height: "100%", display: "flex", alignItems: "flex-end", paddingBottom: 3 }}>
              <div style={{ width: 1, height: 8, background: "var(--border)", marginRight: 3 }} />
              <span style={{ fontSize: 9, color: "var(--text-secondary)" }}>{i}s</span>
            </div>
          ))}
        </div>

        {/* Video track */}
        <TrackRow label="Video" icon="🎥" totalW={totalW} clips={videoClips} mediaFiles={mediaFiles} selectedClipId={selectedClipId} selectClip={selectClip} removeClip={removeClip} PX_PER_SEC={PX_PER_SEC} />

        {/* Image overlay track */}
        <TrackRow label="Overlay" icon="🖼" totalW={totalW} clips={imageClips} mediaFiles={mediaFiles} selectedClipId={selectedClipId} selectClip={selectClip} removeClip={removeClip} PX_PER_SEC={PX_PER_SEC} />

        {/* Audio track placeholder */}
        <div style={{ display: "flex", height: TRACK_HEIGHT, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ width: 100, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", borderRight: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
            <span style={{ fontSize: 13 }}>🔊</span>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Audio</span>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 12px" }}>
            <span style={{ fontSize: 11, color: "var(--text-secondary)", opacity: 0.5 }}>Drag audio files here</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackRow({
  label, icon, totalW, clips, mediaFiles, selectedClipId, selectClip, removeClip, PX_PER_SEC,
}: {
  label: string; icon: string; totalW: number; PX_PER_SEC: number;
  clips: ReturnType<typeof useTimelineStore.getState>["clips"];
  mediaFiles: ReturnType<typeof useProjectStore.getState>["mediaFiles"];
  selectedClipId: string | null;
  selectClip: (id: string | null) => void;
  removeClip: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", height: TRACK_HEIGHT, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
      {/* Track label */}
      <div style={{ width: 100, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", borderRight: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</span>
      </div>

      {/* Clip region */}
      <div style={{ position: "relative", flex: 1, minWidth: totalW, overflowX: "visible" }}>
        {clips.map((clip) => {
          const media = mediaFiles.find((f) => f.id === clip.media_id);
          const dur   = clipDuration(clip, media?.duration_seconds ?? null);
          // Position: sum of durations before this clip
          const clips_before = clips.filter((c) => c.order < clip.order);
          const offsetSec = clips_before.reduce((s, c) => {
            const m = mediaFiles.find((f) => f.id === c.media_id);
            return s + clipDuration(c, m?.duration_seconds ?? null);
          }, 0);
          const left  = offsetSec * PX_PER_SEC;
          const width = Math.max(dur * PX_PER_SEC, 30);
          const isSelected = clip.id === selectedClipId;
          const thumb = media ? getMediaThumbnailUrl(media.id) : null;

          return (
            <div
              key={clip.id}
              title={`${media?.filename ?? clip.id} · ${dur.toFixed(1)}s — Double-click to remove`}
              onClick={() => selectClip(clip.id)}
              onDoubleClick={() => removeClip(clip.id)}
              style={{
                position: "absolute",
                left,
                top: 4,
                width,
                height: TRACK_HEIGHT - 8,
                borderRadius: 4,
                border: `2px solid ${isSelected ? "var(--accent)" : "rgba(255,255,255,0.15)"}`,
                background: isSelected ? "rgba(233,69,96,0.15)" : "var(--bg-tertiary)",
                cursor: "pointer",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "0 6px",
                userSelect: "none",
                boxSizing: "border-box",
                transition: "border-color 0.1s",
              }}
            >
              {thumb && (
                <img src={thumb} alt="" style={{ height: "100%", width: 32, objectFit: "cover", borderRadius: 2, flexShrink: 0, opacity: 0.8 }} />
              )}
              <span style={{ fontSize: 10, color: isSelected ? "var(--accent)" : "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {media?.filename ?? clip.id}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
