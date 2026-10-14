import { useRef, useState, useCallback, type ReactNode } from "react";

interface PanelLayoutProps {
  left?: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  bottom?: ReactNode;
}

const MIN_H = 140;
const MAX_H = 520;
const DEFAULT_H = 220;

export function PanelLayout({ left, center, right, bottom }: PanelLayoutProps) {
  const [bottomH, setBottomH] = useState(DEFAULT_H);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(DEFAULT_H);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = bottomH;
    e.preventDefault();

    const onMove = (me: MouseEvent) => {
      if (!dragging.current) return;
      const dy = startY.current - me.clientY; // drag up = bigger
      setBottomH(Math.min(MAX_H, Math.max(MIN_H, startH.current + dy)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [bottomH]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: bottom ? `1fr ${bottomH}px` : "1fr",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        flex: 1,          // still a flex-item in its parent (.app-body)
        minHeight: 0,
      }}
    >
      {/* Top area: left | center | right */}
      <div
        style={{
          display: "flex",
          overflow: "hidden",
          minHeight: 0,
          height: "100%",   /* resolve % heights for children */
        }}
      >
        {left && (
          <aside
            style={{
              width: 220,
              flexShrink: 0,
              background: "var(--bg-secondary)",
              borderRight: "1px solid var(--border)",
              overflowY: "auto",
            }}
          >
            {left}
          </aside>
        )}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--bg-primary)",
            overflow: "hidden",
            position: "relative",
            height: "100%",  /* lets PreviewPlayer use height:100% */
          }}
        >
          {center}
        </main>
        {right && (
          <aside
            style={{
              width: 220,
              flexShrink: 0,
              background: "var(--bg-secondary)",
              borderLeft: "1px solid var(--border)",
              overflowY: "auto",
            }}
          >
            {right}
          </aside>
        )}
      </div>

      {/* Bottom area: timeline */}
      {bottom && (
        <div
          style={{
            background: "var(--bg-secondary)",
            borderTop: "1px solid var(--border)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Drag handle */}
          <div
            onMouseDown={onMouseDown}
            title="Drag to resize timeline"
            style={{
              height: 5,
              flexShrink: 0,
              cursor: "ns-resize",
              background: "transparent",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--accent)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          />
          <div style={{ flex: 1, overflow: "hidden" }}>{bottom}</div>
        </div>
      )}
    </div>
  );
}
