import { useState } from "react";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { useAudioStore } from "../../stores/audioStore";
import { AspectRatioSelector } from "../shared/AspectRatioSelector";
import { cropToNewFile } from "../../api/client";
import type { AspectRatio } from "../shared/AspectRatioSelector";
import { TransitionPicker } from "./TransitionPicker";

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

function AudioProperties() {
  const { tracks, selectedTrackId, updateTrack } = useAudioStore();
  const track = tracks.find((t) => t.id === selectedTrackId) ?? null;

  if (!track) return null;

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      <Section>
        <Label>🎵 Audio Track</Label>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.name}
        </div>
      </Section>

      {/* Volume */}
      <Section>
        <Label>Volume</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={0} max={1} step={0.01}
            value={track.volume}
            onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
            style={{ flex: 1, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-primary)", width: 32, textAlign: "right" }}>
            {Math.round(track.volume * 100)}%
          </span>
        </div>
      </Section>

      {/* Fade In */}
      <Section>
        <Label>▶︎ Fade In</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={0} max={5} step={0.1}
            value={track.fade_in ?? 0}
            onChange={(e) => updateTrack(track.id, { fade_in: Number(e.target.value) })}
            style={{ flex: 1, accentColor: "#533483" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-primary)", width: 32, textAlign: "right" }}>
            {(track.fade_in ?? 0).toFixed(1)}s
          </span>
        </div>
        <svg width="100%" height="20" viewBox="0 0 200 20" preserveAspectRatio="none"
          style={{ marginTop: 4, display: "block" }}>
          <path d="M0,20 Q80,20 100,0 L200,0" fill="none" stroke="#533483" strokeWidth="1.5" />
          <path d="M0,20 Q80,20 100,0 L200,0 L200,20 Z" fill="rgba(83,52,131,0.2)" />
        </svg>
      </Section>

      {/* Fade Out */}
      <Section>
        <Label>⏹ Fade Out</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={0} max={5} step={0.1}
            value={track.fade_out ?? 0}
            onChange={(e) => updateTrack(track.id, { fade_out: Number(e.target.value) })}
            style={{ flex: 1, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-primary)", width: 32, textAlign: "right" }}>
            {(track.fade_out ?? 0).toFixed(1)}s
          </span>
        </div>
        <svg width="100%" height="20" viewBox="0 0 200 20" preserveAspectRatio="none"
          style={{ marginTop: 4, display: "block" }}>
          <path d="M0,0 L100,0 Q120,0 200,20" fill="none" stroke="#e94560" strokeWidth="1.5" />
          <path d="M0,0 L100,0 Q120,0 200,20 L0,20 Z" fill="rgba(233,69,96,0.1)" />
        </svg>
      </Section>

      {/* Offset */}
      <Section>
        <Label>⏱ Offset</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={0} max={60} step={0.1}
            value={track.offset}
            onChange={(e) => updateTrack(track.id, { offset: Number(e.target.value) })}
            style={{ flex: 1, accentColor: "#3fb950" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-primary)", width: 40, textAlign: "right" }}>
            {track.offset.toFixed(1)}s
          </span>
        </div>
      </Section>
    </div>
  );
}

export function PropertiesPanel() {
  const { selectedClipId, clips, updateClip } = useTimelineStore();
  const { mediaFiles, addMediaFile } = useProjectStore();
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const { selectedTrackId } = useAudioStore();

  // Show audio properties if an audio track is selected
  if (selectedTrackId) return <AudioProperties />;

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

  const handleSaveApply = async () => {
    if (!media || applying) return;
    setApplying(true);
    setApplyMsg(null);
    try {
      const res = await cropToNewFile(String(media.id), crop);
      const newMedia = res.data;
      // Add new file to media browser
      addMediaFile(newMedia);
      // Rewire this clip to point at the new cropped file
      updateClip(clip.id, { media_id: newMedia.id, crop: null });
      setApplyMsg(`Saved as ${newMedia.filename}`);
    } catch {
      setApplyMsg("Save failed.");
    } finally {
      setApplying(false);
    }
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
        <button
          onClick={handleSaveApply}
          disabled={applying}
          className="btn btn-primary"
          style={{ marginTop: 8, width: "100%", fontSize: 12, padding: "5px 0" }}
        >
          {applying ? "Saving…" : "Save as New File"}
        </button>
        {applyMsg && (
          <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>{applyMsg}</p>
        )}
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

      {/* TRANSITION */}
      <Section>
        <Label>Transition In</Label>
        <TransitionPicker
          value={clip.transition_in ?? "none"}
          duration={clip.transition_dur ?? 0.5}
          onChange={(type, dur) => updateClip(clip.id, { transition_in: type, transition_dur: dur })}
        />
      </Section>
    </div>
  );
}
