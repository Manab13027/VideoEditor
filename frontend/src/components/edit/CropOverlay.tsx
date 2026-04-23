import React, { useRef, useCallback, useEffect } from "react";

export interface CropRect {
  x: number; // % of container width, 0-100
  y: number;
  w: number;
  h: number;
}

interface Props {
  crop: CropRect;
  onChange: (crop: CropRect) => void;
  aspectRatio?: number | null; // w/h, e.g. 16/9; null = free
}

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

const CURSORS: Record<Handle, string> = {
  nw: "nw-resize", n: "n-resize", ne: "ne-resize",
  e: "e-resize",  se: "se-resize", s: "s-resize",
  sw: "sw-resize", w: "w-resize",  move: "move",
};

const H = 10; // handle size px
const MIN = 5; // minimum crop % size

function pct(v: number) {
  return `${v}%`;
}

const HANDLES: { id: Handle; style: React.CSSProperties }[] = [
  { id: "nw", style: { top: -H / 2, left: -H / 2 } },
  { id: "n",  style: { top: -H / 2, left: "calc(50% - 5px)" } },
  { id: "ne", style: { top: -H / 2, right: -H / 2 } },
  { id: "e",  style: { top: "calc(50% - 5px)", right: -H / 2 } },
  { id: "se", style: { bottom: -H / 2, right: -H / 2 } },
  { id: "s",  style: { bottom: -H / 2, left: "calc(50% - 5px)" } },
  { id: "sw", style: { bottom: -H / 2, left: -H / 2 } },
  { id: "w",  style: { top: "calc(50% - 5px)", left: -H / 2 } },
];

export function CropOverlay({ crop, onChange, aspectRatio }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    startCrop: CropRect;
  } | null>(null);

  const onHandleDown = useCallback(
    (handle: Handle) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startCrop: { ...crop },
      };
    },
    [crop]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      const el = containerRef.current;
      if (!drag || !el) return;

      const rect = el.getBoundingClientRect();
      const dx = ((e.clientX - drag.startX) / rect.width) * 100;
      const dy = ((e.clientY - drag.startY) / rect.height) * 100;
      const { x, y, w, h } = drag.startCrop;
      let nx = x, ny = y, nw = w, nh = h;

      switch (drag.handle) {
        case "move":
          nx = Math.max(0, Math.min(100 - w, x + dx));
          ny = Math.max(0, Math.min(100 - h, y + dy));
          break;
        case "nw":
          nx = Math.min(x + w - MIN, x + dx);
          ny = Math.min(y + h - MIN, y + dy);
          nw = w - (nx - x);
          nh = h - (ny - y);
          break;
        case "n":
          ny = Math.min(y + h - MIN, y + dy);
          nh = h - (ny - y);
          break;
        case "ne":
          ny = Math.min(y + h - MIN, y + dy);
          nw = Math.max(MIN, w + dx);
          nh = h - (ny - y);
          break;
        case "e":
          nw = Math.max(MIN, w + dx);
          break;
        case "se":
          nw = Math.max(MIN, w + dx);
          nh = Math.max(MIN, h + dy);
          break;
        case "s":
          nh = Math.max(MIN, h + dy);
          break;
        case "sw":
          nx = Math.min(x + w - MIN, x + dx);
          nw = w - (nx - x);
          nh = Math.max(MIN, h + dy);
          break;
        case "w":
          nx = Math.min(x + w - MIN, x + dx);
          nw = w - (nx - x);
          break;
      }

      nx = Math.max(0, nx);
      ny = Math.max(0, ny);
      nw = Math.min(nw, 100 - nx);
      nh = Math.min(nh, 100 - ny);

      if (aspectRatio) {
        // Enforce ratio: derive h from w, clamp if needed
        nh = nw / aspectRatio;
        if (ny + nh > 100) { nh = 100 - ny; nw = nh * aspectRatio; }
        if (nx + nw > 100) { nw = 100 - nx; nh = nw / aspectRatio; }
      }

      onChange({ x: nx, y: ny, w: nw, h: nh });
    };

    const onUp = () => { dragRef.current = null; };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [onChange]);

  const { x, y, w, h } = crop;

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, userSelect: "none", pointerEvents: "none" }}
    >
      {/* Dark mask: top */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: pct(y), background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
      {/* Dark mask: bottom */}
      <div style={{ position: "absolute", top: pct(y + h), left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
      {/* Dark mask: left */}
      <div style={{ position: "absolute", top: pct(y), height: pct(h), left: 0, width: pct(x), background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
      {/* Dark mask: right */}
      <div style={{ position: "absolute", top: pct(y), height: pct(h), left: pct(x + w), right: 0, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />

      {/* Crop box */}
      <div
        onMouseDown={onHandleDown("move")}
        style={{
          position: "absolute",
          left: pct(x),
          top: pct(y),
          width: pct(w),
          height: pct(h),
          border: "2px solid rgba(255,255,255,0.9)",
          boxSizing: "border-box",
          cursor: "move",
          pointerEvents: "all",
        }}
      >
        {/* Rule-of-thirds lines */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {[33.33, 66.66].map((p) => (
            <React.Fragment key={p}>
              <div style={{ position: "absolute", left: `${p}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.25)" }} />
              <div style={{ position: "absolute", top: `${p}%`, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.25)" }} />
            </React.Fragment>
          ))}
        </div>

        {/* Corner + edge handles */}
        {HANDLES.map(({ id, style }) => (
          <div
            key={id}
            onMouseDown={onHandleDown(id)}
            style={{
              position: "absolute",
              width: H,
              height: H,
              background: "#ffffff",
              border: "1.5px solid #333",
              borderRadius: 2,
              cursor: CURSORS[id],
              zIndex: 10,
              pointerEvents: "all",
              ...style,
            }}
          />
        ))}
      </div>
    </div>
  );
}
