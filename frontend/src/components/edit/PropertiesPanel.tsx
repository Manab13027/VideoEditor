import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { AspectRatioSelector } from "../shared/AspectRatioSelector";
import type { AspectRatio } from "../shared/AspectRatioSelector";

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="section-label" style={{ marginBottom: 6 }}>
      {children}
    </p>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {children}
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={0}
        step={1}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--text-primary)",
          padding: "4px 6px",
          fontSize: 12,
          width: "100%",
        }}
      />
    </div>
  );
}

export function PropertiesPanel() {
  const { selectedClipId, clips, updateClip } = useTimelineStore();
  const { mediaFiles } = useProjectStore();

  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  const media = clip ? mediaFiles.find((f) => f.id === clip.media_id) ?? null : null;

  if (!clip || !media) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 16,
          color: "var(--text-secondary)",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        Select a clip to edit properties
      </div>
    );
  }

  const crop = clip.crop ?? { x: 0, y: 0, w: 100, h: 100 };

  const setCrop = (key: "x" | "y" | "w" | "h", val: number) => {
    updateClip(clip.id, { crop: { ...crop, [key]: val } });
  };

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      {/* CROP */}
      <Section>
        <Label>Crop</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <NumInput label="X" value={crop.x} onChange={(v) => setCrop("x", v)} />
          <NumInput label="Y" value={crop.y} onChange={(v) => setCrop("y", v)} />
          <NumInput label="W" value={crop.w} onChange={(v) => setCrop("w", v)} />
          <NumInput label="H" value={crop.h} onChange={(v) => setCrop("h", v)} />
        </div>
      </Section>

      {/* ASPECT RATIO */}
      <Section>
        <Label>Aspect Ratio</Label>
        <AspectRatioSelector
          value="Free"
          onChange={(_ratio: AspectRatio) => {
            // aspect ratio is a display hint; no clip field for it yet
          }}
        />
      </Section>

      {/* TRIM — video only */}
      {clip.type === "video" && (
        <Section>
          <Label>Trim</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <NumInput
              label="Start (s)"
              value={clip.trim_start}
              onChange={(v) => updateClip(clip.id, { trim_start: v })}
            />
            <NumInput
              label="End (s)"
              value={clip.trim_end ?? (media.duration_seconds ?? 0)}
              onChange={(v) => updateClip(clip.id, { trim_end: v })}
            />
          </div>
        </Section>
      )}

      {/* SPEED — video only */}
      {clip.type === "video" && (
        <Section>
          <Label>Speed</Label>
          <select
            value={clip.speed}
            onChange={(e) => updateClip(clip.id, { speed: Number(e.target.value) })}
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-primary)",
              padding: "4px 8px",
              fontSize: 12,
              width: "100%",
              cursor: "pointer",
            }}
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </Section>
      )}

      {/* DURATION — image only */}
      {clip.type === "image" && (
        <Section>
          <Label>Duration</Label>
          <NumInput
            label="Seconds"
            value={clip.duration ?? 5}
            onChange={(v) => updateClip(clip.id, { duration: v })}
          />
        </Section>
      )}
    </div>
  );
}
