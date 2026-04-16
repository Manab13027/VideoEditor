interface ProgressBarProps {
  progress: number;
  status?: string;
  label?: string;
}

export function ProgressBar({ progress, status, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const done = clamped >= 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {(label || status) && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          {label && <span style={{ color: "var(--text-primary)" }}>{label}</span>}
          {status && <span style={{ color: "var(--text-secondary)" }}>{status}</span>}
        </div>
      )}
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{
            width: `${clamped}%`,
            background: done ? "var(--success)" : "var(--accent)",
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "right" }}>
        {done ? "✓ Done" : `${Math.round(clamped)}%`}
      </div>
    </div>
  );
}
