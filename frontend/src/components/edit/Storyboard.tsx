import { useRef, useState } from "react";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { useAudioStore } from "../../stores/audioStore";

interface StoryboardProps {
  zoom: number;
}

const BASE_WIDTH = 88;
const BASE_HEIGHT = 72;

export function Storyboard({ zoom }: StoryboardProps) {
  const { clips, selectedClipId, selectClip, removeClip, reorderClips, insertClipAt } =
    useTimelineStore();
  const { mediaFiles } = useProjectStore();
  const { tracks: audioTracks, removeTrack } = useAudioStore();

  const dragId = useRef<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const cardW = Math.round(BASE_WIDTH * zoom);
  const cardH = Math.round(BASE_HEIGHT * zoom);

  // ── internal clip reorder ──────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("clip_id", id);
  };

  const handleDropOnClip = (targetId: string) => {
    if (!dragId.current || dragId.current === targetId) return;
    const from = sorted.findIndex((c) => c.id === dragId.current);
    const to = sorted.findIndex((c) => c.id === targetId);
    const reordered = [...sorted];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    reorderClips(reordered.map((c, i) => ({ ...c, order: i })));
    dragId.current = null;
  };

  // ── insert-between drop zones ──────────────────────────────────────────────
  const handleGapDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropIndex(idx);
  };

  const handleGapDragLeave = () => setDropIndex(null);

  const handleGapDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDropIndex(null);

    // External drag from MediaBrowser
    const mediaId = e.dataTransfer.getData("media_id");
    const mediaType = e.dataTransfer.getData("media_type") as "video" | "image" | "audio";
    if (mediaId) {
      const media = mediaFiles.find((f) => String(f.id) === mediaId);
      if (!media || media.media_type === "audio") return;
      insertClipAt(
        {
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          media_id: media.id,
          type: mediaType === "image" ? "image" : "video",
          trim_start: 0,
          trim_end: media.duration_seconds ?? null,
          crop: null,
          speed: 1,
          duration: mediaType === "image" ? 5 : null,
        },
        idx
      );
      return;
    }

    // Internal reorder via gap drop
    const clipId = e.dataTransfer.getData("clip_id");
    if (clipId) {
      const from = sorted.findIndex((c) => c.id === clipId);
      if (from === -1) return;
      const reordered = [...sorted];
      const [moved] = reordered.splice(from, 1);
      const adjustedIdx = from < idx ? idx - 1 : idx;
      reordered.splice(adjustedIdx, 0, moved);
      reorderClips(reordered.map((c, i) => ({ ...c, order: i })));
    }
    dragId.current = null;
  };

  const GapZone = ({ idx }: { idx: number }) => {
    const active = dropIndex === idx;
    return (
      <div
        onDragOver={(e) => handleGapDragOver(e, idx)}
        onDragLeave={handleGapDragLeave}
        onDrop={(e) => handleGapDrop(e, idx)}
        style={{
          width: active ? 24 : 6,
          height: cardH,
          flexShrink: 0,
          borderRadius: 3,
          background: active ? "var(--accent)" : "transparent",
          opacity: active ? 0.7 : 1,
          transition: "width 0.1s, background 0.1s",
          cursor: "default",
        }}
      />
    );
  };

  // Handle audio drop onto the storyboard audio lane
  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData("media_id");
    const mediaType = e.dataTransfer.getData("media_type");
    if (!mediaId || mediaType !== "audio") return;
    const media = mediaFiles.find((f) => String(f.id) === mediaId);
    if (!media) return;
    const { addTrack } = useAudioStore.getState();
    addTrack({
      id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: "music",
      mediaId: String(media.id),
      name: media.filename,
      volume: 1.0,
      offset: 0,
      muted: false,
      waveform: [],
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* ── Video / Image clip row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          overflowX: "auto",
          flex: 1,
        }}
      >
        {/* Leading gap zone (insert at index 0) */}
        <GapZone idx={0} />

        {sorted.map((clip, i) => {
          const media = mediaFiles.find((f) => f.id === clip.media_id);
          const isSelected = clip.id === selectedClipId;
          const isVideo = clip.type === "video";

          return (
            <div key={clip.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              <div
                draggable
                onClick={() => selectClip(clip.id)}
                onDragStart={(e) => handleDragStart(e, clip.id)}
                onDrop={() => handleDropOnClip(clip.id)}
                onDragOver={(e) => e.preventDefault()}
                title="Click to select · Drag to reorder"
                style={{
                  position: "relative",
                  flexShrink: 0,
                  width: cardW,
                  height: cardH,
                  borderRadius: 6,
                  border: `2px solid ${isSelected ? "var(--accent)" : isVideo ? "#2a3a4a" : "#2d2040"}`,
                  background: isVideo ? "var(--bg-tertiary)" : "#1e1830",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  cursor: "grab",
                  userSelect: "none",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected)
                    e.currentTarget.style.borderColor = isVideo ? "var(--accent)" : "#8b5cf6";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    e.currentTarget.style.borderColor = isVideo ? "#2a3a4a" : "#2d2040";
                }}
              >
                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); removeClip(clip.id); }}
                  title="Remove clip"
                  style={{
                    position: "absolute",
                    top: 3,
                    right: 3,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "rgba(200,50,50,0.85)",
                    border: "none",
                    color: "#fff",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1,
                    zIndex: 1,
                  }}
                >
                  ×
                </button>
                <span style={{ fontSize: Math.max(12, 22 * zoom) }}>
                  {isVideo ? "🎥" : "🖼"}
                </span>
                {zoom >= 0.5 && (
                  <span
                    style={{
                      fontSize: Math.max(8, 10 * zoom),
                      color: "var(--text-secondary)",
                      maxWidth: cardW - 8,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textAlign: "center",
                    }}
                  >
                    {media?.filename ?? clip.media_id}
                  </span>
                )}
              </div>

              {/* Gap zone after each clip */}
              <GapZone idx={i + 1} />
            </div>
          );
        })}

        {/* Placeholder "+" card */}
        <div
          style={{
            flexShrink: 0,
            width: cardW,
            height: cardH,
            borderRadius: 6,
            border: "2px dashed var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-secondary)",
            fontSize: 22,
            cursor: "default",
          }}
        >
          +
        </div>
      </div>

      {/* ── Audio track lane ── */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleAudioDrop}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-primary)",
          minHeight: 36,
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-secondary)", flexShrink: 0, marginRight: 4 }}>
          🔊
        </span>
        {audioTracks.length === 0 ? (
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            Drop audio here to add a track
          </span>
        ) : (
          audioTracks.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 4,
                background: "#1a3d2e",
                border: "1px solid #2a5c3e",
                flexShrink: 0,
                maxWidth: 160,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "#6ee7b7",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 120,
                }}
              >
                {t.name}
              </span>
              <button
                onClick={() => removeTrack(t.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#6ee7b7",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 0,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
