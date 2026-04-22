import { useSocialStore } from "../../stores/socialStore";
import { useTimelineStore } from "../../stores/timelineStore";
import type { SocialPlatform } from "../../types";

const LIMITS: Record<SocialPlatform, { label: string; maxFileSizeMB: number; maxDurationSeconds: number }> = {
  tiktok:         { label: "TikTok",    maxFileSizeMB: 287,    maxDurationSeconds: 600   },
  instagram_reel: { label: "IG Reel",   maxFileSizeMB: 100,    maxDurationSeconds: 90    },
  instagram_post: { label: "IG Post",   maxFileSizeMB: 100,    maxDurationSeconds: 60    },
  youtube:        { label: "YouTube",   maxFileSizeMB: 262144, maxDurationSeconds: 43200 },
};

function estimateSizeMB(durationSeconds: number, bitrateKbps = 8000): number {
  return (durationSeconds * bitrateKbps) / 8 / 1024;
}

export function ValidationWarnings() {
  const { metadata } = useSocialStore();
  const { clips } = useTimelineStore();

  const totalDuration = clips.reduce((sum, c) => {
    const raw = c.trim_end != null
      ? c.trim_end - c.trim_start
      : (c.duration ?? 0) - c.trim_start;
    return sum + raw / (c.speed || 1);
  }, 0);

  const sizeMB = estimateSizeMB(totalDuration);

  if (metadata.platforms.length === 0) return null;

  const checks = metadata.platforms.map((platform) => {
    const lim = LIMITS[platform];
    const violations: string[] = [];
    const fixes: string[] = [];

    if (totalDuration > lim.maxDurationSeconds) {
      violations.push(`${Math.round(totalDuration)}s exceeds ${lim.maxDurationSeconds}s limit`);
      fixes.push("Trim clips, or use Auto Cut in AI Tools to remove silence");
    }
    if (sizeMB > lim.maxFileSizeMB) {
      violations.push(`~${Math.round(sizeMB)} MB exceeds ${lim.maxFileSizeMB} MB limit`);
      fixes.push("Lower bitrate in Export settings");
    }

    return { label: lim.label, violations, fixes, ok: violations.length === 0 };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {checks.map(({ label, violations, fixes, ok }) => (
        <div key={label}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: ok ? "#22c55e" : "#f59e0b", fontSize: 13 }}>{ok ? "✓" : "⚠"}</span>
            <span style={{ fontSize: 11, color: ok ? "#22c55e" : "#f59e0b", fontWeight: ok ? 400 : 600 }}>
              {label} — {ok ? "looks good" : violations[0]}
            </span>
          </div>
          {fixes.length > 0 && (
            <div style={{ marginLeft: 20, marginTop: 3, padding: "4px 8px", background: "#1a1200", borderRadius: 4, borderLeft: "2px solid #f59e0b" }}>
              <p style={{ fontSize: 10, color: "#d97706", margin: 0 }}>Fix: {fixes[0]}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
