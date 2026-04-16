import { useRef } from "react";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";

export function Storyboard() {
  const { clips, selectedClipId, selectClip, removeClip, reorderClips } =
    useTimelineStore();
  const { mediaFiles } = useProjectStore();
  const dragId = useRef<string | null>(null);

  const sorted = [...clips].sort((a, b) => a.order - b.order);

  const handleDragStart = (id: string) => {
    dragId.current = id;
  };

  const handleDrop = (targetId: string) => {
    if (!dragId.current || dragId.current === targetId) return;
    const from = sorted.findIndex((c) => c.id === dragId.current);
    const to = sorted.findIndex((c) => c.id === targetId);
    const reordered = [...sorted];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    reorderClips(reordered.map((c, i) => ({ ...c, order: i })));
    dragId.current = null;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        overflowX: "auto",
        height: "100%",
      }}
    >
      {sorted.map((clip) => {
        const media = mediaFiles.find((f) => f.id === clip.media_id);
        const isSelected = clip.id === selectedClipId;
        const isVideo = clip.type === "video";

        return (
          <div
            key={clip.id}
            draggable
            onClick={() => selectClip(clip.id)}
            onDoubleClick={() => removeClip(clip.id)}
            onDragStart={() => handleDragStart(clip.id)}
            onDrop={() => handleDrop(clip.id)}
            onDragOver={handleDragOver}
            title="Click to select · Double-click to remove · Drag to reorder"
            style={{
              flexShrink: 0,
              width: 88,
              height: 72,
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
              transition: "border-color 0.15s, transform 0.1s",
            }}
            onMouseEnter={(e) => {
              if (!isSelected) e.currentTarget.style.borderColor = isVideo ? "var(--accent)" : "#8b5cf6";
            }}
            onMouseLeave={(e) => {
              if (!isSelected) e.currentTarget.style.borderColor = isVideo ? "#2a3a4a" : "#2d2040";
            }}
          >
            <span style={{ fontSize: 22 }}>{isVideo ? "🎥" : "🖼"}</span>
            <span
              style={{
                fontSize: 10,
                color: "var(--text-secondary)",
                maxWidth: 76,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textAlign: "center",
              }}
            >
              {media?.filename ?? clip.media_id}
            </span>
          </div>
        );
      })}

      {/* Placeholder "+" card */}
      <div
        style={{
          flexShrink: 0,
          width: 88,
          height: 72,
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
  );
}
