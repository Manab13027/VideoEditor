import type { ReactNode } from "react";

interface PanelLayoutProps {
  left?: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  bottom?: ReactNode;
}

export function PanelLayout({ left, center, right, bottom }: PanelLayoutProps) {
  return (
    <div className="panel-layout">
      <div className="panel-main">
        {left && <aside className="panel-left">{left}</aside>}
        <main className="panel-center">{center}</main>
        {right && <aside className="panel-right">{right}</aside>}
      </div>
      {bottom && <div className="panel-bottom">{bottom}</div>}
    </div>
  );
}
