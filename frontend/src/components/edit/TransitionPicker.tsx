import type { TransitionType } from "../../types";

interface TransitionDef {
  type: TransitionType;
  label: string;
  icon: string;
}

export const TRANSITIONS: TransitionDef[] = [
  { type: "none",        label: "None",       icon: "⛔" },
  { type: "fade",        label: "Fade",        icon: "🌫️" },
  { type: "crossfade",   label: "Crossfade",   icon: "🔄" },
  { type: "wipe_left",   label: "Wipe ←",      icon: "⬅️" },
  { type: "wipe_right",  label: "Wipe →",      icon: "➡️" },
  { type: "wipe_up",     label: "Wipe ↑",      icon: "⬆️" },
  { type: "wipe_down",   label: "Wipe ↓",      icon: "⬇️" },
  { type: "slide_left",  label: "Slide ←",     icon: "🔀" },
  { type: "slide_right", label: "Slide →",     icon: "↔️" },
  { type: "zoom_in",     label: "Zoom In",     icon: "🔍" },
  { type: "zoom_out",    label: "Zoom Out",    icon: "🔎" },
  { type: "blur",        label: "Blur",        icon: "💨" },
  { type: "flash",       label: "Flash",       icon: "⚡" },
  { type: "glitch",      label: "Glitch",      icon: "📺" },
  { type: "pixelate",    label: "Pixelate",    icon: "🟦" },
  { type: "film_burn",   label: "Film Burn",   icon: "🎞️" },
  { type: "radial",      label: "Radial",      icon: "🌀" },
  { type: "circle",      label: "Circle",      icon: "⭕" },
  { type: "reveal",      label: "Reveal",      icon: "🃏" },
  { type: "fade_black",  label: "Fade Black",  icon: "⬛" },
  { type: "fade_white",  label: "Fade White",  icon: "⬜" },
];

interface TransitionPickerProps {
  value: TransitionType;
  duration: number;   // seconds
  onChange: (type: TransitionType, duration: number) => void;
}

export function TransitionPicker({ value, duration, onChange }: TransitionPickerProps) {
  return (
    <div>
      {/* Duration slider */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: "var(--text-secondary)", width: 52, flexShrink: 0 }}>Duration</span>
        <input
          type="range" min={0.2} max={2} step={0.1}
          value={duration}
          onChange={(e) => onChange(value, Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
        <span style={{ fontSize: 10, color: "var(--text-primary)", width: 28, textAlign: "right", flexShrink: 0 }}>
          {duration.toFixed(1)}s
        </span>
      </div>

      {/* 5-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
        {TRANSITIONS.map((t) => {
          const active = t.type === value;
          return (
            <button
              key={t.type}
              onClick={() => onChange(t.type, duration)}
              title={t.label}
              style={{
                border: `${active ? 2 : 1}px solid ${active ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 6,
                padding: "5px 2px",
                background: active ? "rgba(233,69,96,0.12)" : "var(--bg-tertiary)",
                cursor: "pointer",
                textAlign: "center",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}
            >
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ fontSize: 8, color: active ? "var(--accent)" : "var(--text-secondary)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
