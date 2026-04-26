import { useState, useEffect, useRef } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { useTimelineStore } from "../../stores/timelineStore";
import { useAudioStore } from "../../stores/audioStore";
import { startExport, getExportStatus, uploadToDrive, getExportDownloadUrl } from "../../api/client";
import { ProgressBar } from "../shared/ProgressBar";
import type { ExportJob } from "../../types";

interface QualityTierDef {
  id: string;
  label: string;
  sub: string;
  w: number;
  h: number;
  bitrate: number;
}

const QUALITY_TIERS: QualityTierDef[] = [
  { id: "sd", label: "SD", sub: "480p · 2 Mbps", w: 854, h: 480, bitrate: 2 },
  { id: "hd", label: "HD", sub: "720p · 5 Mbps", w: 1280, h: 720, bitrate: 5 },
  { id: "fullhd", label: "Full HD", sub: "1080p · 8 Mbps", w: 1920, h: 1080, bitrate: 8 },
  { id: "4k", label: "4K", sub: "2160p · 20 Mbps", w: 3840, h: 2160, bitrate: 20 },
];

interface PresetDef {
  id: string;
  label: string;
  sub: string;
}

const PRESETS: PresetDef[] = [
  { id: "youtube", label: "YouTube", sub: "16:9 · 1080p" },
  { id: "instagram_reel", label: "Instagram Reel", sub: "9:16 · 1080p" },
  { id: "tiktok", label: "TikTok", sub: "9:16 · 1080p" },
  { id: "twitter", label: "Twitter/X", sub: "16:9 · 720p" },
  { id: "instagram_post", label: "Instagram Post", sub: "1:1 · 1080p" },
  { id: "whatsapp", label: "WhatsApp", sub: "16:9 · 720p compressed" },
];

const CONTAINERS = ["mp4", "mov", "mkv", "webm", "avi"];
const CODECS: { label: string; value: string }[] = [
  { label: "H.264", value: "libx264" },
  { label: "H.265", value: "libx265" },
  { label: "VP9", value: "libvpx-vp9" },
  { label: "AV1", value: "libaom-av1" },
];
const RESOLUTIONS = [
  { label: "4K", w: 3840, h: 2160 },
  { label: "1080p", w: 1920, h: 1080 },
  { label: "720p", w: 1280, h: 720 },
  { label: "480p", w: 854, h: 480 },
];
const FPS_OPTIONS = [24, 30, 60];

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px",
        fontSize: 12,
        borderRadius: 4,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "rgba(233,69,96,0.12)" : "var(--bg-tertiary)",
        color: active ? "var(--accent)" : "var(--text-primary)",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      {children}
    </button>
  );
}

export function ExportSettings() {
  const { project, saveTimeline } = useProjectStore();
  const { mode, clips, overlays } = useTimelineStore();
  const { tracks: audioTracks, muteOriginal } = useAudioStore();

  const [selectedPreset, setSelectedPreset] = useState<string | null>("youtube");
  const [qualityTier, setQualityTier] = useState<string | null>(null);
  const [container, setContainer] = useState("mp4");
  const [codec, setCodec] = useState("libx264");
  const [resolution, setResolution] = useState({ w: 1920, h: 1080 });
  const [fps, setFps] = useState(30);
  const [bitrate, setBitrate] = useState(8);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploadToDriveEnabled, setUploadToDriveEnabled] = useState(false);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [exporting, setExporting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop polling when done
  useEffect(() => {
    if (!exportJob) return;
    if (exportJob.status === "completed" || exportJob.status === "failed") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [exportJob?.status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleExport = async () => {
    if (!project || exporting) return;
    setExporting(true);
    setExportJob(null);

    try {
      // Persist current timeline state to backend before exporting
      await saveTimeline({ mode, clips, overlays, audioTracks, muteOriginal });

      const res = await startExport({
        project_id: project.id,
        ...(selectedPreset ? { preset: selectedPreset } : {}),
        ...(qualityTier ? { quality_tier: qualityTier } : {}),
        container,
        video_codec: codec,
        audio_codec: "aac",
        width: resolution.w,
        height: resolution.h,
        bitrate,
        fps,
        upload_to_drive: uploadToDriveEnabled,
      });

      const job = res.data;
      setExportJob(job);

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await getExportStatus(job.id);
          const updated = statusRes.data;
          setExportJob(updated);

          if (updated.status === "completed" || updated.status === "failed") {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setExporting(false);

            if (updated.status === "completed" && uploadToDriveEnabled && updated.output_path) {
              try {
                await uploadToDrive(updated.output_path);
              } catch {
                // Drive upload failure is non-blocking
              }
            }
          }
        } catch {
          // silently continue polling
        }
      }, 1000);
    } catch {
      setExporting(false);
    }
  };

  const handleQualityTierClick = (tier: QualityTierDef) => {
    setQualityTier(tier.id);
    setSelectedPreset(null);
    setResolution({ w: tier.w, h: tier.h });
    setBitrate(tier.bitrate);
  };

  const handlePresetClick = (presetId: string) => {
    setSelectedPreset(presetId);
    setQualityTier(null);
  };

  const progressLabel = exportJob
    ? exportJob.status === "completed"
      ? exportJob.output_path ?? "Export complete"
      : exportJob.status === "failed"
      ? exportJob.error ?? "Export failed"
      : "Exporting..."
    : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "4px 0" }}>
      {/* Quality Tiers */}
      <div>
        <p className="section-label" style={{ marginBottom: 8 }}>
          Quality Tier
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          {QUALITY_TIERS.map((tier) => (
            <button
              key={tier.id}
              onClick={() => handleQualityTierClick(tier)}
              style={{
                flex: 1,
                padding: "8px 6px",
                borderRadius: 5,
                border: `1px solid ${qualityTier === tier.id ? "var(--accent)" : "var(--border)"}`,
                background: qualityTier === tier.id ? "rgba(233,69,96,0.12)" : "var(--bg-tertiary)",
                color: qualityTier === tier.id ? "var(--accent)" : "var(--text-primary)",
                cursor: "pointer",
                textAlign: "center",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{tier.label}</p>
              <p style={{ fontSize: 10, color: qualityTier === tier.id ? "var(--accent)" : "var(--text-secondary)" }}>
                {tier.sub}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Social Media Presets */}
      <div>
        <p className="section-label" style={{ marginBottom: 8 }}>
          Social Media Presets
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
          }}
        >
          {PRESETS.map((preset) => {
            const active = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => handlePresetClick(preset.id)}
                style={{
                  padding: "7px 10px",
                  borderRadius: 5,
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  background: active ? "rgba(233,69,96,0.12)" : "var(--bg-tertiary)",
                  color: active ? "var(--accent)" : "var(--text-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 500, marginBottom: 1 }}>{preset.label}</p>
                <p style={{ fontSize: 10, color: active ? "var(--accent)" : "var(--text-secondary)" }}>
                  {preset.sub}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced Settings */}
      <div>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "var(--text-secondary)",
            fontSize: 12,
          }}
        >
          <span>{showAdvanced ? "▲" : "▼"}</span>
          <span className="section-label" style={{ pointerEvents: "none" }}>
            Advanced Settings
          </span>
        </button>

        {showAdvanced && (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "10px 12px",
              background: "var(--bg-tertiary)",
              borderRadius: 6,
              border: "1px solid var(--border)",
            }}
          >
            {/* Container */}
            <div>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 5 }}>Container</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {CONTAINERS.map((c) => (
                  <ToggleButton key={c} active={container === c} onClick={() => setContainer(c)}>
                    {c}
                  </ToggleButton>
                ))}
              </div>
            </div>

            {/* Codec */}
            <div>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 5 }}>Codec</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {CODECS.map((c) => (
                  <ToggleButton key={c.value} active={codec === c.value} onClick={() => setCodec(c.value)}>
                    {c.label}
                  </ToggleButton>
                ))}
              </div>
            </div>

            {/* Resolution */}
            <div>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 5 }}>Resolution</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {RESOLUTIONS.map((r) => (
                  <ToggleButton
                    key={r.label}
                    active={resolution.w === r.w && resolution.h === r.h}
                    onClick={() => setResolution({ w: r.w, h: r.h })}
                  >
                    {r.label}
                  </ToggleButton>
                ))}
              </div>
            </div>

            {/* Bitrate */}
            <div>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 5 }}>
                Bitrate — {bitrate} Mbps
              </p>
              <input
                type="range"
                min={1}
                max={50}
                value={bitrate}
                onChange={(e) => setBitrate(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--accent)" }}
              />
            </div>

            {/* FPS */}
            <div>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 5 }}>FPS</p>
              <div style={{ display: "flex", gap: 6 }}>
                {FPS_OPTIONS.map((f) => (
                  <ToggleButton key={f} active={fps === f} onClick={() => setFps(f)}>
                    {f}
                  </ToggleButton>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Google Drive */}
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          cursor: "pointer",
          padding: "8px 10px",
          background: "var(--bg-tertiary)",
          borderRadius: 6,
          border: "1px solid var(--border)",
        }}
      >
        <input
          type="checkbox"
          checked={uploadToDriveEnabled}
          onChange={(e) => setUploadToDriveEnabled(e.target.checked)}
          style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
        />
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 2 }}>
            Upload to Google Drive
          </p>
          <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            Save a copy to your Drive after export
          </p>
        </div>
      </label>

      {/* Export progress */}
      {exportJob && (
        <div>
          <ProgressBar
            progress={exportJob.progress}
            label={exportJob.status === "completed" ? "Export complete!" : progressLabel}
            status={exportJob.status}
          />
          {exportJob.status === "failed" && exportJob.error && (
            <p style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>{exportJob.error}</p>
          )}
          {exportJob.status === "completed" && (
            <a
              href={getExportDownloadUrl(exportJob.id)}
              download
              style={{
                display: "block",
                marginTop: 8,
                padding: "8px 0",
                textAlign: "center",
                borderRadius: 5,
                border: "1px solid var(--accent)",
                background: "rgba(233,69,96,0.12)",
                color: "var(--accent)",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Download Video
            </a>
          )}
        </div>
      )}

      {/* Export button */}
      <button
        className="btn btn-primary"
        onClick={handleExport}
        disabled={exporting || !project}
        style={{ width: "100%", fontSize: 14, padding: "10px 0" }}
      >
        🚀 Export Video
      </button>
    </div>
  );
}
