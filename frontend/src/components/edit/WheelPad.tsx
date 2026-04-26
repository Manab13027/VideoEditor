import { useRef, useCallback } from "react";
import type { ColorRange } from "../../types";

const SIZE = 78;
const MAX = 0.4;

interface Props {
  label: string;
  value: ColorRange;
  onChange: (v: ColorRange) => void;
}

export function WheelPad({ label, value, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const fromEvent = useCallback((e: MouseEvent | React.MouseEvent): ColorRange => {
    if (!ref.current) return value;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    let dx = (e.clientX - rect.left - cx) / cx;
    let dy = (e.clientY - rect.top - cy) / cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) { dx /= dist; dy /= dist; }
    // X = warm(R)/cool(B), Y = green/magenta
    return { r: dx * MAX, g: -dy * MAX, b: -dx * MAX * 0.7 };
  }, [value]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    onChange(fromEvent(e));
    const move = (ev: MouseEvent) => onChange(fromEvent(ev));
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const dotX = 50 + (value.r / MAX) * 45;
  const dotY = 50 - (value.g / MAX) * 45;
  const isNeutral = Math.abs(value.r) < 0.01 && Math.abs(value.g) < 0.01 && Math.abs(value.b) < 0.01;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <div
        ref={ref}
        onMouseDown={onMouseDown}
        title="Drag: left=cool · right=warm · up=green · down=magenta"
        style={{
          width: SIZE, height: SIZE, borderRadius: "50%", cursor: "crosshair",
          position: "relative", border: "1px solid var(--border)", overflow: "hidden",
          background: "conic-gradient(from -90deg, #ff2200, #ffaa00, #00ff44, #00ffff, #0033ff, #ff00cc, #ff2200)",
          flexShrink: 0,
        }}
      >
        {/* Radial fade to dark center */}
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle at center, rgba(0,0,0,0.65) 0%, transparent 70%)" }} />
        {/* Neutral center */}
        <div style={{ position: "absolute", top: "50%", left: "50%", width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.35)", transform: "translate(-50%,-50%)" }} />
        {/* Value dot */}
        <div style={{
          position: "absolute", width: 10, height: 10, borderRadius: "50%",
          background: isNeutral ? "rgba(255,255,255,0.5)" : `var(--accent)`,
          border: "2px solid #fff",
          left: `${Math.max(5, Math.min(95, dotX))}%`,
          top: `${Math.max(5, Math.min(95, dotY))}%`,
          transform: "translate(-50%,-50%)",
          pointerEvents: "none",
          boxShadow: "0 0 4px rgba(0,0,0,0.8)",
        }} />
      </div>
      <button
        onClick={() => onChange({ r: 0, g: 0, b: 0 })}
        style={{ fontSize: 9, padding: "1px 8px", borderRadius: 3, border: "1px solid var(--border)", background: "none", color: "var(--text-secondary)", cursor: "pointer" }}
      >
        ↺
      </button>
    </div>
  );
}
