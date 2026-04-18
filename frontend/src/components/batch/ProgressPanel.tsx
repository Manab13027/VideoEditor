import { useEffect } from "react";
import { useBatchStore } from "../../stores/batchStore";
import { getBatchStatus } from "../../api/client";
import { ProgressBar } from "../shared/ProgressBar";

const STATUS_COLORS: Record<string, string> = {
  pending: "var(--text-secondary)",
  processing: "var(--accent)",
  completed: "var(--success, #22c55e)",
  failed: "#f87171",
};

export function ProgressPanel() {
  const { activeJob, setActiveJob } = useBatchStore();

  useEffect(() => {
    if (!activeJob) return;
    const done = activeJob.status === "completed" || activeJob.status === "failed";
    if (done) return;

    const interval = setInterval(async () => {
      try {
        const res = await getBatchStatus(activeJob.id);
        setActiveJob(res.data);
        if (res.data.status === "completed" || res.data.status === "failed") {
          clearInterval(interval);
        }
      } catch {
        // silently continue polling
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeJob?.id, activeJob?.status, setActiveJob]);

  if (!activeJob) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 8,
          padding: 24,
        }}
      >
        <p style={{ color: "var(--text-secondary)", fontSize: 13, textAlign: "center" }}>
          No active job. Configure operations and click Process.
        </p>
      </div>
    );
  }

  const results = activeJob.results ?? [];
  const completed = results.filter((r) => r.status === "completed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const total = results.length;
  const overallProgress = total > 0 ? ((completed + failed) / total) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "10px 12px 8px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span className="section-label">Progress</span>
        <span
          style={{
            fontSize: 11,
            padding: "2px 7px",
            borderRadius: 3,
            background: "var(--bg-tertiary)",
            color: STATUS_COLORS[activeJob.status] ?? "var(--text-secondary)",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {activeJob.status}
        </span>
      </div>

      {/* Per-file results */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {results.map((r) => (
          <div key={r.file_id}>
            <ProgressBar
              progress={r.progress}
              label={r.filename}
              status={r.status}
            />
            {r.status === "failed" && r.error && (
              <p
                style={{
                  fontSize: 11,
                  color: "#f87171",
                  marginTop: 3,
                  paddingLeft: 2,
                }}
              >
                {r.error}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Overall progress */}
      <div
        style={{
          padding: "10px 12px",
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <ProgressBar
          progress={overallProgress}
          label={`Overall — ${completed + failed}/${total} complete`}
        />
      </div>
    </div>
  );
}
