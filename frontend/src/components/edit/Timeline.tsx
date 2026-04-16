import { useTimelineStore } from "../../stores/timelineStore";
import { Storyboard } from "./Storyboard";

const TRACKS = [
  { icon: "🎥", label: "Video" },
  { icon: "🖼", label: "Image Overlay" },
  { icon: "🔊", label: "Audio" },
];

export function Timeline() {
  const { mode, setMode } = useTimelineStore();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Mode toggle */}
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
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {mode === "storyboard" ? (
          <Storyboard />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {TRACKS.map((track) => (
              <div
                key={track.label}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "0 12px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: 14 }}>{track.icon}</span>
                <span
                  className="section-label"
                  style={{ width: 90, flexShrink: 0 }}
                >
                  {track.label}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: 4,
                    background: "var(--bg-primary)",
                    border: "1px dashed var(--border)",
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
