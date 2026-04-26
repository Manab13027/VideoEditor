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
  const { tracks: audioTracks, addTrack, removeTrack, updateTrack } = useAudioStore();

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
      <AudioLane
        audioTracks={audioTracks}
        onDrop={handleAudioDrop}
        onRemove={removeTrack}
        onToggleMute={(id) => {
          const t = audioTracks.find((x) => x.id === id);
          if (t) updateTrack(id, { muted: !t.muted });
        }}
        onReorder={(from, to) => {
          const arr = [...audioTracks];
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          arr.forEach((t, i) => updateTrack(t.id, { offset: i * 0 })); // keep offsets, just reorder UI
          // re-add in new order by removing all then adding back
          arr.forEach((t) => removeTrack(t.id));
          arr.forEach((t) => addTrack(t));
        }}
      />
    </div>
  );
}

// ── Audio Lane sub-component ──────────────────────────────────────────────────
interface AudioLaneProps {
  audioTracks: import("../../types").AudioTrack[];
  onDrop: (e: React.DragEvent) => void;
  onRemove: (id: string) => void;
  onToggleMute: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}

function AudioLane({ audioTracks, onDrop, onRemove, onToggleMute, onReorder }: AudioLaneProps) {
  const dragIdx = useRef<number | null>(null);
  const [muteOriginal, setMuteOriginal] = useState(false);

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg-primary)",
        flexShrink: 0,
      }}
    >
      {/* Mute original video audio toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>🎥 Original audio</span>
        <button
          onClick={() => setMuteOriginal((v) => !v)}
          style={{
            padding: "2px 8px",
            fontSize: 10,
            borderRadius: 3,
            border: `1px solid ${muteOriginal ? "var(--accent)" : "var(--border)"}`,
            background: muteOriginal ? "rgba(233,69,96,0.15)" : "transparent",
            color: muteOriginal ? "var(--accent)" : "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          {muteOriginal ? "🔇 Muted" : "🔊 Unmuted"}
        </button>
        <span style={{ fontSize: 10, color: "var(--text-secondary)", marginLeft: "auto" }}>
          🎵 Drag audio from Media Browser to add tracks
        </span>
      </div>

      {/* Audio track rows */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          padding: "4px 12px",
          minHeight: 36,
          maxHeight: 120,
          overflowY: "auto",
        }}
      >
        {audioTracks.length === 0 && (
          <span style={{ fontSize: 11, color: "var(--text-secondary)", padding: "4px 0" }}>
            No audio tracks — drop audio files here
          </span>
        )}
        {audioTracks.map((t, i) => (
          <div
            key={t.id}
            draggable
            onDragStart={() => { dragIdx.current = i; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.stopPropagation();
              if (dragIdx.current !== null && dragIdx.current !== i) {
                onReorder(dragIdx.current, i);
              }
              dragIdx.current = null;
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 8px",
              borderRadius: 4,
              background: t.muted ? "#2a2020" : "#1a3d2e",
              border: `1px solid ${t.muted ? "#5c2a2a" : "#2a5c3e"}`,
              cursor: "grab",
              opacity: t.muted ? 0.6 : 1,
            }}
          >
            {/* Drag handle */}
            <span style={{ fontSize: 10, color: "var(--text-secondary)", cursor: "grab" }}>⠿</span>

            {/* Track name */}
            <span
              style={{
                fontSize: 11,
                color: t.muted ? "#f87171" : "#6ee7b7",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 160,
              }}
            >
              {t.name}
            </span>

            {/* Mute toggle */}
            <button
              onClick={() => onToggleMute(t.id)}
              title={t.muted ? "Unmute" : "Mute"}
              style={{
                background: "none",
                border: "none",
                fontSize: 12,
                cursor: "pointer",
                padding: 0,
                lineHeight: 1,
                color: t.muted ? "#f87171" : "#6ee7b7",
              }}
            >
              {t.muted ? "🔇" : "🔊"}
            </button>

            {/* Remove */}
            <button
              onClick={() => onRemove(t.id)}
              title="Remove track"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
