import { useState } from "react";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { AspectRatioSelector } from "../shared/AspectRatioSelector";
import type { AspectRatio } from "../shared/AspectRatioSelector";
import { applyCrop, getMediaDownloadUrl } from "../../api/client";
import type { ClipColor, FilterPreset, ColorCurves, ColorWheels, ColorRange, TransitionType } from "../../types";
import { CurvesEditor, DEFAULT_CURVES } from "./CurvesEditor";
import { WheelPad } from "./WheelPad";

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;

const FILTER_PRESETS: { id: FilterPreset; label: string }[] = [
  { id: "grayscale",   label: "B&W" },
  { id: "sepia",       label: "Sepia" },
  { id: "vintage",     label: "Vintage" },
  { id: "vivid",       label: "Vivid" },
  { id: "cool",        label: "Cool" },
  { id: "warm",        label: "Warm" },
  { id: "teal_orange", label: "Teal+Orange" },
  { id: "matte",       label: "Matte" },
  { id: "film_noir",   label: "Film Noir" },
  { id: "golden",      label: "Golden" },
  { id: "cyberpunk",   label: "Cyberpunk" },
  { id: "faded",       label: "Faded" },
];

const TRANSITIONS: { id: TransitionType; label: string }[] = [
  { id: "none",       label: "None" },
  { id: "fade",       label: "Fade" },
  { id: "crossfade",  label: "Crossfade" },
  { id: "wipe_left",  label: "Wipe Left" },
  { id: "wipe_right", label: "Wipe Right" },
  { id: "zoom_in",    label: "Zoom In" },
  { id: "glitch",     label: "Glitch" },
];

const DEFAULT_COLOR: ClipColor = { brightness: 1, contrast: 1, saturation: 1, hue: 0 };
const DEFAULT_COLOR_RANGE: ColorRange = { r: 0, g: 0, b: 0 };
const DEFAULT_WHEELS: ColorWheels = {
  shadows:    { ...DEFAULT_COLOR_RANGE },
  midtones:   { ...DEFAULT_COLOR_RANGE },
  highlights: { ...DEFAULT_COLOR_RANGE },
};

function Label({ children }: { children: React.ReactNode }) {
  return <p className="section-label" style={{ marginBottom: 6 }}>{children}</p>;
}

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", ...style }}>
      {children}
    </div>
  );
}

function NumInput({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</span>
      <input
        type="number" value={value} min={min ?? 0} max={max} step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", padding: "4px 6px", fontSize: 12, width: "100%" }}
      />
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, display }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; display?: string;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: 10, color: "var(--text-primary)" }}>{display ?? value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--accent)" }}
      />
    </div>
  );
}

export function PropertiesPanel() {
  const { selectedClipId, clips, updateClip, cropMode, setCropMode, cropAspectRatio, setCropAspectRatio } = useTimelineStore();
  const { mediaFiles, updateMediaFile, bustProxy } = useProjectStore();

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const RATIO_MAP: Record<AspectRatio, number | null> = {
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "1:1":  1,
    "4:3":  4 / 3,
    "Free": null,
  };

  const currentAspectLabel: AspectRatio =
    (Object.entries(RATIO_MAP).find(([, v]) => v === cropAspectRatio)?.[0] as AspectRatio) ?? "Free";

  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  const media = clip ? mediaFiles.find((f) => f.id === clip.media_id) ?? null : null;

  if (!clip || !media) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 16, color: "var(--text-secondary)", fontSize: 12, textAlign: "center" }}>
        Select a clip to edit properties
      </div>
    );
  }

  const crop    = clip.crop   ?? { x: 0, y: 0, w: 100, h: 100 };
  const color   = clip.color  ?? { ...DEFAULT_COLOR };
  const curves  = clip.curves ?? null;
  const wheels  = clip.wheels ?? { ...DEFAULT_WHEELS };
  const effects = clip.effects ?? {};
  const isFullFrame = crop.x === 0 && crop.y === 0 && crop.w === 100 && crop.h === 100;

  const updateColor   = (key: keyof ClipColor, val: number) => updateClip(clip.id, { color: { ...color, [key]: val } });
  const updateCurves  = (c: ColorCurves) => updateClip(clip.id, { curves: c });
  const updateWheels  = (w: ColorWheels) => updateClip(clip.id, { wheels: w });
  const updateEffects = (key: string, val: number) => updateClip(clip.id, { effects: { ...effects, [key]: val } });

  const resetBtn = (onClick: () => void) => (
    <button onClick={onClick} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-secondary)", cursor: "pointer", fontSize: 10, padding: "2px 7px" }}>
      Reset
    </button>
  );

  const filterBtn = (active: boolean, onClick: () => void, children: React.ReactNode) => (
    <button onClick={onClick} style={{
      padding: "5px 4px", borderRadius: 4,
      border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
      background: active ? "rgba(233,69,96,0.12)" : "var(--bg-primary)",
      color: active ? "var(--accent)" : "var(--text-primary)",
      cursor: "pointer", fontSize: 11, fontWeight: active ? 600 : 400,
    }}>
      {children}
    </button>
  );

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>

      {/* ── CROP ── */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Label>Crop</Label>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setCropMode(!cropMode)} style={{
              background: cropMode ? "var(--accent)" : "none",
              border: `1px solid ${cropMode ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 4, color: cropMode ? "#fff" : "var(--text-secondary)",
              cursor: "pointer", fontSize: 10, padding: "2px 7px", fontWeight: cropMode ? 600 : 400,
            }}>
              {cropMode ? "✓ Active" : "✂ Edit"}
            </button>
            {resetBtn(() => { updateClip(clip.id, { crop: { x: 0, y: 0, w: 100, h: 100 } }); setCropMode(false); })}
          </div>
        </div>
        {cropMode ? (
          <>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 8px", lineHeight: 1.5 }}>Drag handles in the preview to adjust.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {(["x", "y", "w", "h"] as const).map((k) => (
                <div key={k} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>{k}</span>
                  <span style={{ fontSize: 12, color: "var(--text-primary)", padding: "3px 6px", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 4 }}>{Math.round(crop[k])}%</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button disabled={applying} onClick={async () => {
                if (!media) return;
                setApplying(true); setApplyError(null);
                try {
                  const result = await applyCrop(String(media.id), crop);
                  updateMediaFile(result.data);
                  bustProxy(String(media.id));
                  updateClip(clip.id, { crop: { x: 0, y: 0, w: 100, h: 100 } });
                  setCropMode(false);
                } catch (e: unknown) {
                  const ax = e as { response?: { data?: { detail?: string } } };
                  setApplyError(ax?.response?.data?.detail ?? (e instanceof Error ? e.message : "Crop failed"));
                } finally { setApplying(false); }
              }} style={{ flex: 1, padding: "6px 0", background: applying ? "var(--bg-secondary)" : "var(--accent)", border: "none", borderRadius: 4, color: "#fff", cursor: applying ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600 }}>
                {applying ? "Applying…" : "Apply & Save"}
              </button>
              <a
                href={getMediaDownloadUrl(String(media.id))}
                download={media.filename}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 10px", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-secondary)", fontSize: 11, textDecoration: "none", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                ↓ Download
              </a>
            </div>
            {applyError && <p style={{ fontSize: 11, color: "#e94560", marginTop: 6 }}>{applyError}</p>}
          </>
        ) : (
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
            {isFullFrame ? "No crop — click ✂ Edit to start" : `x:${Math.round(crop.x)}% y:${Math.round(crop.y)}% — ${Math.round(crop.w)}×${Math.round(crop.h)}%`}
          </p>
        )}
      </Section>

      {/* ── ASPECT RATIO ── */}
      <Section>
        <Label>Aspect Ratio</Label>
        <AspectRatioSelector value={currentAspectLabel} onChange={(r) => {
          const ratio = RATIO_MAP[r] ?? null;
          setCropAspectRatio(ratio);
          if (ratio !== null) {
            const newW = crop.w;
            const newH = newW / ratio;
            updateClip(clip.id, { crop: { x: crop.x, y: crop.y, w: newW, h: Math.min(newH, 100 - crop.y) } });
            if (!cropMode) setCropMode(true);
          }
        }} />
        {cropAspectRatio !== null && (
          <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "6px 0 0" }}>
            Locked to {currentAspectLabel} — drag handles in preview to reposition.
          </p>
        )}
      </Section>

      {/* ── COLOR ── */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Label>Color</Label>
          {resetBtn(() => updateClip(clip.id, { color: null }))}
        </div>
        <Slider label="Brightness" value={color.brightness} min={0} max={2} step={0.05} onChange={(v) => updateColor("brightness", v)} display={color.brightness.toFixed(2)} />
        <Slider label="Contrast"   value={color.contrast}   min={0} max={2} step={0.05} onChange={(v) => updateColor("contrast", v)}   display={color.contrast.toFixed(2)} />
        <Slider label="Saturation" value={color.saturation} min={0} max={2} step={0.05} onChange={(v) => updateColor("saturation", v)} display={color.saturation.toFixed(2)} />
        <Slider label="Hue"        value={color.hue}        min={0} max={360} step={1}  onChange={(v) => updateColor("hue", v)}        display={`${Math.round(color.hue)}°`} />
      </Section>

      {/* ── FILTERS ── */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Label>Filters</Label>
          {clip.filter && resetBtn(() => updateClip(clip.id, { filter: null }))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
          {FILTER_PRESETS.map((f) =>
            filterBtn(clip.filter === f.id, () => updateClip(clip.id, { filter: clip.filter === f.id ? null : f.id }), f.label)
          )}
        </div>
      </Section>

      {/* ── RGB CURVES ── */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Label>RGB Curves</Label>
          {curves && resetBtn(() => updateClip(clip.id, { curves: null }))}
        </div>
        <CurvesEditor curves={curves} onChange={updateCurves} />
      </Section>

      {/* ── COLOR WHEELS ── */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Label>Color Wheels</Label>
          {resetBtn(() => updateClip(clip.id, { wheels: null }))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          <WheelPad label="Shadows"    value={wheels.shadows}    onChange={(v) => updateWheels({ ...wheels, shadows: v })} />
          <WheelPad label="Midtones"   value={wheels.midtones}   onChange={(v) => updateWheels({ ...wheels, midtones: v })} />
          <WheelPad label="Highlights" value={wheels.highlights} onChange={(v) => updateWheels({ ...wheels, highlights: v })} />
        </div>
      </Section>

      {/* ── EFFECTS ── */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Label>Effects</Label>
          {(effects.motion_blur || effects.glow || effects.shake) ? resetBtn(() => updateClip(clip.id, { effects: null })) : null}
        </div>
        <Slider label="Motion Blur" value={effects.motion_blur ?? 0} min={0} max={1} step={0.05} onChange={(v) => updateEffects("motion_blur", v)} display={`${Math.round((effects.motion_blur ?? 0) * 100)}%`} />
        <Slider label="Glow"        value={effects.glow ?? 0}        min={0} max={1} step={0.05} onChange={(v) => updateEffects("glow", v)}        display={`${Math.round((effects.glow ?? 0) * 100)}%`} />
        <Slider label="Shake"       value={effects.shake ?? 0}       min={0} max={1} step={0.05} onChange={(v) => updateEffects("shake", v)}       display={`${Math.round((effects.shake ?? 0) * 100)}%`} />
      </Section>

      {/* ── TRANSFORM ── */}
      <Section>
        <Label>Transform</Label>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {([90, 180, 270] as const).map((deg) => {
            const active = (clip.rotate ?? 0) === deg;
            return filterBtn(active, () => updateClip(clip.id, { rotate: active ? 0 : deg }), `↻${deg}°`);
          })}
        </div>
        {clip.type === "video" && (
          filterBtn(!!clip.reversed, () => updateClip(clip.id, { reversed: !clip.reversed }), clip.reversed ? "◀ Reversed" : "▶ Reverse Video")
        )}
      </Section>

      {/* ── TRANSITION — video only ── */}
      {clip.type === "video" && (
        <Section>
          <Label>Transition In</Label>
          <select
            value={clip.transition_in ?? "none"}
            onChange={(e) => updateClip(clip.id, { transition_in: e.target.value as TransitionType })}
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", padding: "4px 8px", fontSize: 12, width: "100%", cursor: "pointer", marginBottom: 8 }}
          >
            {TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          {(clip.transition_in && clip.transition_in !== "none") && (
            <NumInput label="Duration (s)" value={clip.transition_dur ?? 0.5} min={0.1} max={3} step={0.1}
              onChange={(v) => updateClip(clip.id, { transition_dur: v })} />
          )}
        </Section>
      )}

      {/* ── TRIM — video only ── */}
      {clip.type === "video" && (
        <Section>
          <Label>Trim</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <NumInput label="Start (s)" value={clip.trim_start} onChange={(v) => updateClip(clip.id, { trim_start: v })} />
            <NumInput label="End (s)"   value={clip.trim_end ?? (media.duration_seconds ?? 0)} onChange={(v) => updateClip(clip.id, { trim_end: v })} />
          </div>
        </Section>
      )}

      {/* ── SPEED — video only ── */}
      {clip.type === "video" && (
        <Section>
          <Label>Speed</Label>
          <select value={clip.speed} onChange={(e) => updateClip(clip.id, { speed: Number(e.target.value) })}
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", padding: "4px 8px", fontSize: 12, width: "100%", cursor: "pointer" }}>
            {SPEED_OPTIONS.map((s) => <option key={s} value={s}>{s}x</option>)}
          </select>
        </Section>
      )}

      {/* ── FADE ── */}
      {clip.type === "video" && (
        <Section>
          <Label>Fade</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <NumInput label="Fade In (s)"  value={clip.fade_in  ?? 0} min={0} step={0.5} onChange={(v) => updateClip(clip.id, { fade_in: v })} />
            <NumInput label="Fade Out (s)" value={clip.fade_out ?? 0} min={0} step={0.5} onChange={(v) => updateClip(clip.id, { fade_out: v })} />
          </div>
        </Section>
      )}

      {/* ── DURATION — image only ── */}
      {clip.type === "image" && (
        <Section>
          <Label>Duration</Label>
          <NumInput label="Seconds" value={clip.duration ?? 5} onChange={(v) => updateClip(clip.id, { duration: v })} />
        </Section>
      )}

    </div>
  );
}
