import { useProjectStore } from "../../stores/projectStore";
import { useTimelineStore } from "../../stores/timelineStore";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PreviewSummary() {
  const { project, mediaFiles } = useProjectStore();
  const { clips } = useTimelineStore();

  const mediaMap = Object.fromEntries(mediaFiles.map((m) => [m.id, m]));

  const totalDuration = clips.reduce((acc, clip) => {
    const media = mediaMap[clip.media_id];
    if (!media) return acc;
    if (clip.type === "video") {
      const end = clip.trim_end ?? media.duration_seconds ?? 0;
      return acc + Math.max(0, end - clip.trim_start);
    }
    // image: use clip.duration or 3s default
    return acc + (clip.duration ?? 3);
  }, 0);

  const sourceFormats = Array.from(
    new Set(
      clips
        .map((c) => mediaMap[c.media_id]?.format)
        .filter(Boolean) as string[]
    )
  )
    .map((f) => f.toUpperCase())
    .join(", ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Mini preview */}
      <div
        style={{
          height: 160,
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            fontSize: 40,
            color: "var(--accent)",
            lineHeight: 1,
          }}
        >
          ▶
        </span>
      </div>

      {/* Project name + duration */}
      <div>
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {project?.name ?? "Untitled Project"}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {formatDuration(totalDuration)}
        </p>
      </div>

      {/* Summary grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px 12px",
        }}
      >
        {[
          { label: "Clips", value: clips.length.toString() },
          { label: "Duration", value: formatDuration(totalDuration) },
          { label: "Source Formats", value: sourceFormats || "—" },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "6px 10px",
            }}
          >
            <p style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {label}
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
