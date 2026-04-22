import { useState } from "react";
import { useSocialStore } from "../../stores/socialStore";
import { useProjectStore } from "../../stores/projectStore";
import { socialMultiExport, getExportStatus } from "../../api/client";
import type { MultiExportJob, SocialPlatform } from "../../types";

const LABELS: Record<SocialPlatform, string> = {
  tiktok:         "TikTok 9:16",
  instagram_reel: "IG Reel 9:16",
  instagram_post: "IG Post 1:1",
  youtube:        "YouTube 16:9",
};

const COLORS: Record<SocialPlatform, string> = {
  tiktok:         "#60a5fa",
  instagram_reel: "#f472b6",
  instagram_post: "#f472b6",
  youtube:        "#f87171",
};

const STATUS_COLOR: Record<MultiExportJob["status"], string> = {
  pending: "#555",
  running: "#f59e0b",
  done:    "#22c55e",
  error:   "#ef4444",
};

const STATUS_LABEL: Record<MultiExportJob["status"], string> = {
  pending: "Queued",
  running: "Running...",
  done:    "Done",
  error:   "Error",
};

export function MultiExportPanel() {
  const { metadata, multiExportJobs, setMultiExportJobs } = useSocialStore();
  const { project } = useProjectStore();
  const [running, setRunning] = useState(false);

  const selected = metadata.platforms;

  const pollJob = (platform: SocialPlatform, jobId: string) => {
    const id = setInterval(async () => {
      try {
        const res = await getExportStatus(jobId);
        const d = res.data;
        const apiStatus =
          d.status === "completed" ? "done" : d.status === "failed" ? "error" : "running";
        setMultiExportJobs((prev) =>
          prev.map((j) =>
            j.jobId === jobId
              ? { ...j, status: apiStatus as MultiExportJob["status"], outputPath: d.output_path, error: d.error }
              : j
          )
        );
        if (apiStatus === "done" || apiStatus === "error") {
          clearInterval(id);
          setMultiExportJobs((prev) => {
            if (prev.every((j) => j.status === "done" || j.status === "error")) {
              setRunning(false);
            }
            return prev;
          });
        }
      } catch {
        clearInterval(id);
      }
    }, 2000);
  };

  // suppress unused-variable warning on platform param — it's used for type constraint
  void (pollJob as (platform: SocialPlatform, jobId: string) => void);

  const startExport = async () => {
    if (!project || selected.length === 0) return;
    setRunning(true);
    try {
      const res = await socialMultiExport({ project_id: project.id, platforms: selected });
      const raw = (res.data as { jobs: { platform: SocialPlatform; job_id: string }[] }).jobs;
      const jobs: MultiExportJob[] = raw.map((j) => ({
        platform: j.platform,
        jobId: j.job_id,
        status: "pending",
        outputPath: null,
        error: null,
      }));
      setMultiExportJobs(jobs);
      jobs.forEach((j) => pollJob(j.platform, j.jobId));
    } catch {
      setRunning(false);
    }
  };

  if (selected.length === 0) {
    return (
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
        Select platforms in Metadata first.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {selected.map((platform) => {
          const job = multiExportJobs.find((j) => j.platform === platform);
          const status = job?.status ?? "pending";
          return (
            <div
              key={platform}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
              <span style={{ fontSize: 11, color: COLORS[platform] }}>{LABELS[platform]}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: STATUS_COLOR[status] }}>
                  ● {STATUS_LABEL[status]}
                </span>
                {status === "done" && job?.outputPath && (
                  <a
                    href={`http://localhost:8000/api/export/${job.jobId}/status`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 10, color: "var(--accent)" }}
                  >
                    View
                  </a>
                )}
                {status === "error" && job?.error && (
                  <span style={{ fontSize: 9, color: "#ef4444" }} title={job.error}>
                    ⚠
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={startExport}
        disabled={running || !project}
        style={{
          padding: "8px 0",
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          background: running || !project ? "var(--bg-tertiary)" : "var(--accent)",
          border: "none",
          color: running || !project ? "var(--text-secondary)" : "#fff",
          cursor: running || !project ? "not-allowed" : "pointer",
        }}
      >
        {running ? "Exporting..." : "Export Selected Platforms"}
      </button>

      {multiExportJobs.length > 0 && (
        <p
          style={{
            fontSize: 9,
            color: "var(--text-secondary)",
            margin: 0,
            textAlign: "center",
          }}
        >
          Files saved to data/exports/
        </p>
      )}
    </div>
  );
}
