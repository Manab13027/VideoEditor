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
    <div className="panel-layout">
      <div className="panel-main">
        {left && <aside className="panel-left">{left}</aside>}
        <main className="panel-center">{center}</main>
        {right && <aside className="panel-right">{right}</aside>}
      </div>
      {bottom && (
        <div className="panel-bottom" style={{ height: bottomH }}>
          {/* drag handle — sits at the top of the bottom panel */}
          <div className="panel-resize-handle" onMouseDown={onMouseDown} title="Drag to resize timeline" />
          <div style={{ flex: 1, overflow: "hidden" }}>{bottom}</div>
        </div>
      )}
    </div>
  );
}
