import { useState } from "react";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { useAudioStore } from "../../stores/audioStore";
import { Storyboard } from "./Storyboard";

// navigate to export tab
function useGoToExport() {
  const { setActiveTab } = useProjectStore();
  return () => setActiveTab("export");
}

const ZOOM_LEVELS = [0.1, 0.25, 0.5, 1, 2] as const;
type ZoomLevel = typeof ZOOM_LEVELS[number];

const TRACK_HEIGHT = 56;

function MultiTrack({ zoom }: { zoom: number }) {
  const { clips, selectedClipId, selectClip, removeClip, insertClipAt } = useTimelineStore();
  const { mediaFiles } = useProjectStore();
  const { tracks: audioTracks, removeTrack } = useAudioStore();

  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const videoClips = sorted.filter((c) => c.type === "video");
  const imageClips = sorted.filter((c) => c.type === "image");

  // Base clip block width scales with zoom
  const BLOCK_W = Math.round(120 * zoom);

  const handleTrackDrop = (e: React.DragEvent, clipType: "video" | "image") => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData("media_id");
    const mediaType = e.dataTransfer.getData("media_type") as "video" | "image" | "audio";
    if (!mediaId || mediaType === "audio") return;
    if (mediaType !== clipType && !(mediaType === "video" && clipType === "video")) return;
    const media = mediaFiles.find((f) => String(f.id) === mediaId);
    if (!media) return;
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
      sorted.length
    );
  };

  const ClipBlock = ({
    clip,
    color,
  }: {
    clip: (typeof sorted)[number];
    color: string;
  }) => {
    const media = mediaFiles.find((f) => f.id === clip.media_id);
    const isSelected = clip.id === selectedClipId;
    return (
      <div
        onClick={() => selectClip(clip.id)}
        title={`${media?.filename ?? clip.media_id} — Double-click to delete`}
        onDoubleClick={() => removeClip(clip.id)}
        style={{
          position: "relative",
          width: BLOCK_W,
          height: TRACK_HEIGHT - 12,
          borderRadius: 5,
          background: color,
          border: `2px solid ${isSelected ? "var(--accent)" : "transparent"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingLeft: 8,
          cursor: "pointer",
          userSelect: "none",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "#fff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: BLOCK_W - 28,
          }}
        >
          {media?.filename ?? clip.media_id}
        </span>
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
            background: "rgba(0,0,0,0.5)",
            border: "none",
            color: "#fff",
            fontSize: 10,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    );
  };

  const TrackRow = ({
    icon,
    label,
    children,
    onDrop,
    onDragOver,
  }: {
    icon: string;
    label: string;
    children: React.ReactNode;
    onDrop?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
  }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: TRACK_HEIGHT,
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      {/* Track label */}
      <div
        style={{
          width: 110,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 12px",
          borderRight: "1px solid var(--border)",
          height: "100%",
        }}
      >
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span className="section-label" style={{ fontSize: 11 }}>{label}</span>
      </div>
      {/* Clip lane */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 8px",
          overflowX: "auto",
          background: "var(--bg-primary)",
        }}
      >
        {children}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      {/* Video track */}
      <TrackRow
        icon="🎥"
        label="Video"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleTrackDrop(e, "video")}
      >
        {videoClips.length === 0 ? (
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            Drag video clips here
          </span>
        ) : (
          videoClips.map((c) => (
            <ClipBlock key={c.id} clip={c} color="#1e3a5f" />
          ))
        )}
      </TrackRow>

      {/* Image overlay track */}
      <TrackRow
        icon="🖼"
        label="Image"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleTrackDrop(e, "image")}
      >
        {imageClips.length === 0 ? (
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            Drag image clips here
          </span>
        ) : (
          imageClips.map((c) => (
            <ClipBlock key={c.id} clip={c} color="#3b1f5e" />
          ))
        )}
      </TrackRow>

      {/* Audio tracks */}
      <TrackRow icon="🔊" label="Audio">
        {audioTracks.length === 0 ? (
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            Drop audio files in Media Browser to add tracks
          </span>
        ) : (
          audioTracks.map((t) => (
            <div
              key={t.id}
              style={{
                position: "relative",
                width: BLOCK_W,
                height: TRACK_HEIGHT - 12,
                borderRadius: 5,
                background: "#1a3d2e",
                display: "flex",
                alignItems: "center",
                paddingLeft: 8,
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              <span style={{ fontSize: 11, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: BLOCK_W - 28 }}>
                {t.name}
              </span>
              <button
                onClick={() => removeTrack(t.id)}
                title="Remove track"
                style={{
                  position: "absolute",
                  top: 3,
                  right: 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.5)",
                  border: "none",
                  color: "#fff",
                  fontSize: 10,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </TrackRow>
    </div>
  );
}

export function Timeline() {
  const { mode, setMode } = useTimelineStore();
  const [zoom, setZoom] = useState<ZoomLevel>(0.5);
  const goToExport = useGoToExport();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <button
          className={`btn ${mode === "storyboard" ? "btn-primary" : "btn-secondary"}`}
          style={{ padding: "3px 10px", fontSize: 12 }}
          onClick={() => setMode("storyboard")}
        >
          Storyboard
        </button>
        <button
          className={`btn ${mode === "multitrack" ? "btn-primary" : "btn-secondary"}`}
          style={{ padding: "3px 10px", fontSize: 12 }}
          onClick={() => setMode("multitrack")}
        >
          Multi-track
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {/* Export shortcut */}
          <button
            className="btn btn-primary"
            style={{ padding: "3px 14px", fontSize: 12 }}
            onClick={goToExport}
          >
            🚀 Export
          </button>
          <div style={{ width: 1, height: 16, background: "var(--border)" }} />
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Zoom</span>
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              style={{
                padding: "2px 7px",
                fontSize: 11,
                borderRadius: 3,
                border: `1px solid ${zoom === z ? "var(--accent)" : "var(--border)"}`,
                background: zoom === z ? "rgba(233,69,96,0.12)" : "transparent",
                color: zoom === z ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {z}×
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {mode === "storyboard" ? (
          <Storyboard zoom={zoom} />
        ) : (
          <MultiTrack zoom={zoom} />
        )}
      </div>
    </div>
  );
}
