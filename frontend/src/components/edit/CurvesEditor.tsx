import { useRef, useEffect, useCallback, useState } from "react";
import type { CurvePoint, ColorCurves } from "../../types";

const W = 160;
const H = 160;
const PT_R = 5;
const MAX_SHIFT = 0.5;

type Channel = keyof ColorCurves;

const CH_COLOR: Record<Channel, string> = {
  rgb: "#ffffff",
  r:   "#ef4444",
  g:   "#22c55e",
  b:   "#60a5fa",
};

const DEFAULT_PTS: CurvePoint[] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];

export const DEFAULT_CURVES: ColorCurves = {
  rgb: DEFAULT_PTS.map(p => ({ ...p })),
  r:   DEFAULT_PTS.map(p => ({ ...p })),
  g:   DEFAULT_PTS.map(p => ({ ...p })),
  b:   DEFAULT_PTS.map(p => ({ ...p })),
};

function catmullRom(t: number, p0: number, p1: number, p2: number, p3: number) {
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
  );
}

function evalCurve(x: number, pts: CurvePoint[]): number {
  const s = [...pts].sort((a, b) => a.x - b.x);
  if (x <= s[0].x) return s[0].y;
  if (x >= s[s.length - 1].x) return s[s.length - 1].y;
  for (let i = 0; i < s.length - 1; i++) {
    if (x >= s[i].x && x <= s[i + 1].x) {
      const t = (x - s[i].x) / (s[i + 1].x - s[i].x);
      const p0 = i > 0 ? s[i - 1].y : s[i].y;
      const p3 = i + 2 < s.length ? s[i + 2].y : s[i + 1].y;
      return Math.max(0, Math.min(255, catmullRom(t, p0, s[i].y, s[i + 1].y, p3)));
    }
  }
  return x;
}

function drawChannel(ctx: CanvasRenderingContext2D, pts: CurvePoint[], color: string, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = alpha < 1 ? 1 : 1.5;
  ctx.beginPath();
  for (let px = 0; px <= W; px++) {
    const y = H - (evalCurve((px / W) * 255, pts) / 255) * H;
    px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

interface Props {
  curves: ColorCurves | null;
  onChange: (c: ColorCurves) => void;
}

export function CurvesEditor({ curves, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ch, setCh] = useState<Channel>("rgb");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const c = curves ?? DEFAULT_CURVES;

  const toData = (cx: number, cy: number): CurvePoint => ({
    x: Math.max(0, Math.min(255, (cx / W) * 255)),
    y: Math.max(0, Math.min(255, ((H - cy) / H) * 255)),
  });

  const hitTest = useCallback((cx: number, cy: number): number => {
    return c[ch].findIndex((pt) => {
      const px = (pt.x / 255) * W;
      const py = H - (pt.y / 255) * H;
      return Math.hypot(cx - px, cy - py) <= PT_R + 3;
    });
  }, [c, ch]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo((i / 4) * W, 0); ctx.lineTo((i / 4) * W, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (i / 4) * H); ctx.lineTo(W, (i / 4) * H); ctx.stroke();
    }

    // Diagonal reference
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();
    ctx.setLineDash([]);

    // Inactive channels
    (["rgb", "r", "g", "b"] as Channel[]).forEach((channel) => {
      if (channel !== ch) drawChannel(ctx, c[channel], CH_COLOR[channel], 0.18);
    });

    // Active channel
    drawChannel(ctx, c[ch], CH_COLOR[ch]);

    // Control points
    c[ch].forEach((pt) => {
      const px = (pt.x / 255) * W;
      const py = H - (pt.y / 255) * H;
      ctx.beginPath();
      ctx.arc(px, py, PT_R, 0, Math.PI * 2);
      ctx.fillStyle = CH_COLOR[ch];
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [c, ch]);

  useEffect(() => { draw(); }, [draw]);

  const getXY = (e: React.MouseEvent | MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const setPoints = (pts: CurvePoint[]) => onChange({ ...c, [ch]: pts });

  const onMouseDown = (e: React.MouseEvent) => {
    const [cx, cy] = getXY(e);
    const idx = hitTest(cx, cy);
    if (idx >= 0) {
      setDragIdx(idx);
    } else {
      const newPt = toData(cx, cy);
      const newPts = [...c[ch], newPt];
      setPoints(newPts);
      setDragIdx(newPts.length - 1);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragIdx === null) return;
    const [cx, cy] = getXY(e);
    setPoints(c[ch].map((p, i) => i === dragIdx ? toData(cx, cy) : p));
  };

  const onMouseUp = () => setDragIdx(null);

  const onDblClick = (e: React.MouseEvent) => {
    const [cx, cy] = getXY(e);
    const idx = hitTest(cx, cy);
    if (idx >= 0 && c[ch].length > 2) {
      setPoints(c[ch].filter((_, i) => i !== idx));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {(["rgb", "r", "g", "b"] as Channel[]).map((channel) => (
          <button
            key={channel}
            onClick={() => setCh(channel)}
            style={{
              flex: 1, padding: "2px 0", borderRadius: 3, fontSize: 10,
              border: `1px solid ${ch === channel ? CH_COLOR[channel] : "var(--border)"}`,
              background: ch === channel ? `${CH_COLOR[channel]}22` : "var(--bg-primary)",
              color: ch === channel ? CH_COLOR[channel] : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {channel.toUpperCase()}
          </button>
        ))}
        <button
          onClick={() => setPoints(DEFAULT_PTS.map(p => ({ ...p })))}
          style={{ padding: "2px 8px", borderRadius: 3, fontSize: 10, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-secondary)", cursor: "pointer" }}
        >
          ↺
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ width: "100%", borderRadius: 4, border: "1px solid var(--border)", cursor: "crosshair", display: "block" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={onDblClick}
      />
      <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: 0 }}>
        Click add · Drag move · Double-click remove
      </p>
    </div>
  );
}

// Export curve evaluation for CSS preview approximation
export { evalCurve, MAX_SHIFT };
