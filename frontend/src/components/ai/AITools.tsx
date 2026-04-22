import { useState } from "react";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { useAIStore } from "../../stores/aiStore";
import {
  aiTranscribe, aiBurnSubtitles, aiRemoveBg, aiAutoCut,
  aiReframe, aiEnhanceFace, aiTrackObject, aiGenerateVideo,
} from "../../api/client";
import type { Caption } from "../../types";

function extractError(e: unknown): string {
  const ax = e as { response?: { data?: { detail?: string } } };
  return ax?.response?.data?.detail ?? extractError(e);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Badge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "#f59e0b", done: "#22c55e", error: "#ef4444", idle: "var(--text-secondary)",
  };
  const labels: Record<string, string> = {
    running: "Running…", done: "Done", error: "Error", idle: "",
  };
  if (status === "idle" || !labels[status]) return null;
  return (
    <span style={{ fontSize: 10, color: colors[status] ?? "#fff", fontWeight: 600, marginLeft: 8 }}>
      ● {labels[status]}
    </span>
  );
}

function RunBtn({ disabled, running, onClick, label }: {
  disabled?: boolean; running?: boolean; onClick: () => void; label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || running}
      style={{
        padding: "6px 14px", borderRadius: 4, fontSize: 12, fontWeight: 600,
        background: disabled || running ? "var(--bg-tertiary)" : "var(--accent)",
        border: "none", color: disabled || running ? "var(--text-secondary)" : "#fff",
        cursor: disabled || running ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {running ? "Running…" : label}
    </button>
  );
}

function Card({ title, icon, desc, children }: {
  title: string; icon: string; desc: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", background: "var(--bg-secondary)", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{title}</p>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>{desc}</p>
        </div>
        <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "12px 14px", background: "var(--bg-primary)", display: "flex", flexDirection: "column", gap: 10 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function NoClipNote() {
  return <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>Select a clip in the Edit tab first.</p>;
}

// ─── Feature panels ───────────────────────────────────────────────────────────

function CaptionsPanel({ mediaId }: { mediaId: string }) {
  const { setJobStatus, setCaptions, toggleCaptions, showCaptions, jobs, captions } = useAIStore();
  const [lang, setLang] = useState("");
  const [style, setStyle] = useState("default");
  const job = jobs[`captions-${mediaId}`];
  const segs = captions[mediaId] ?? [];

  const run = async () => {
    setJobStatus(`captions-${mediaId}`, "running");
    try {
      const res = await aiTranscribe(mediaId, lang || undefined);
      const segments = (res.data as { segments: Caption[] }).segments;
      setCaptions(mediaId, segments);
      setJobStatus(`captions-${mediaId}`, "done", segments);
    } catch (e: unknown) {
      setJobStatus(`captions-${mediaId}`, "error", undefined, extractError(e));
    }
  };

  const burn = async () => {
    setJobStatus(`burn-${mediaId}`, "running");
    try {
      await aiBurnSubtitles(mediaId, style);
      setJobStatus(`burn-${mediaId}`, "done");
    } catch (e: unknown) {
      setJobStatus(`burn-${mediaId}`, "error", undefined, extractError(e));
    }
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={lang} onChange={e => setLang(e.target.value)}
          placeholder="Language (auto)"
          style={{ flex: 1, padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12 }}
        />
        <RunBtn onClick={run} running={job?.status === "running"} label="Transcribe" />
        <Badge status={job?.status ?? "idle"} />
      </div>

      {segs.length > 0 && (
        <>
          <div style={{ maxHeight: 140, overflowY: "auto", background: "var(--bg-secondary)", borderRadius: 4, padding: 8 }}>
            {segs.map((s, i) => (
              <div key={i} style={{ fontSize: 11, marginBottom: 6 }}>
                <span style={{ color: "var(--accent)", fontFamily: "monospace" }}>
                  {s.start.toFixed(1)}s–{s.end.toFixed(1)}s
                </span>{" "}
                <span style={{ color: "var(--text-primary)" }}>{s.text}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={style} onChange={e => setStyle(e.target.value)}
              style={{ flex: 1, padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12 }}
            >
              <option value="default">Default (white)</option>
              <option value="cinematic">Cinematic (yellow italic)</option>
            </select>
            <RunBtn onClick={burn} running={jobs[`burn-${mediaId}`]?.status === "running"} label="Burn In" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
            <input type="checkbox" checked={showCaptions} onChange={toggleCaptions} style={{ accentColor: "var(--accent)" }} />
            Show captions in preview
          </label>
        </>
      )}
      {job?.error && <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{job.error}</p>}
    </>
  );
}

function RemoveBgPanel({ mediaId }: { mediaId: string }) {
  const { setJobStatus, jobs } = useAIStore();
  const job = jobs[`rmbg-${mediaId}`];

  const run = async () => {
    setJobStatus(`rmbg-${mediaId}`, "running");
    try {
      await aiRemoveBg(mediaId);
      setJobStatus(`rmbg-${mediaId}`, "done");
    } catch (e: unknown) {
      setJobStatus(`rmbg-${mediaId}`, "error", undefined, extractError(e));
    }
  };

  return (
    <>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
        Removes background using U2Net AI. Images output as transparent PNG; videos as WebM with alpha channel. Requires <code>pip install rembg[gpu]</code>.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <RunBtn onClick={run} running={job?.status === "running"} label="Remove Background" />
        <Badge status={job?.status ?? "idle"} />
      </div>
      {job?.error && <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{job.error}</p>}
    </>
  );
}

function AutoCutPanel({ mediaId }: { mediaId: string }) {
  const { setJobStatus, jobs } = useAIStore();
  const [threshold, setThreshold] = useState(-35);
  const [minDur, setMinDur] = useState(0.5);
  const job = jobs[`autocut-${mediaId}`];
  const result = job?.result as { segments_removed: number; time_saved_seconds: number } | undefined;

  const run = async () => {
    setJobStatus(`autocut-${mediaId}`, "running");
    try {
      const res = await aiAutoCut(mediaId, threshold, minDur);
      setJobStatus(`autocut-${mediaId}`, "done", res.data);
    } catch (e: unknown) {
      setJobStatus(`autocut-${mediaId}`, "error", undefined, extractError(e));
    }
  };

  return (
    <>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
        Detects and removes silent/quiet segments automatically.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 3px" }}>Silence threshold (dB)</p>
          <input type="number" value={threshold} onChange={e => setThreshold(Number(e.target.value))}
            style={{ width: "100%", padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12 }} />
        </div>
        <div>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 3px" }}>Min silence (s)</p>
          <input type="number" value={minDur} step={0.1} onChange={e => setMinDur(Number(e.target.value))}
            style={{ width: "100%", padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12 }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <RunBtn onClick={run} running={job?.status === "running"} label="Auto Cut" />
        <Badge status={job?.status ?? "idle"} />
      </div>
      {result && (
        <p style={{ fontSize: 11, color: "var(--success)", margin: 0 }}>
          Removed {result.segments_removed} segments · saved {result.time_saved_seconds?.toFixed(1)}s
        </p>
      )}
      {job?.error && <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{job.error}</p>}
    </>
  );
}

function ReframePanel({ mediaId }: { mediaId: string }) {
  const { setJobStatus, jobs } = useAIStore();
  const [preset, setPreset] = useState("9:16");
  const job = jobs[`reframe-${mediaId}`];

  const presets: Record<string, [number, number]> = {
    "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350],
    "16:9": [1920, 1080], "4:3": [1440, 1080],
  };

  const run = async () => {
    const [w, h] = presets[preset] ?? [1080, 1920];
    setJobStatus(`reframe-${mediaId}`, "running");
    try {
      await aiReframe(mediaId, w, h);
      setJobStatus(`reframe-${mediaId}`, "done");
    } catch (e: unknown) {
      setJobStatus(`reframe-${mediaId}`, "error", undefined, extractError(e));
    }
  };

  return (
    <>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
        Uses face detection to find the subject and reframes the video to the target aspect ratio. Requires <code>pip install opencv-python</code>.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select value={preset} onChange={e => setPreset(e.target.value)}
          style={{ flex: 1, padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12 }}>
          {Object.keys(presets).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <RunBtn onClick={run} running={job?.status === "running"} label="Reframe" />
        <Badge status={job?.status ?? "idle"} />
      </div>
      {job?.error && <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{job.error}</p>}
    </>
  );
}

function EnhancePanel({ mediaId }: { mediaId: string }) {
  const { setJobStatus, jobs } = useAIStore();
  const job = jobs[`enhance-${mediaId}`];

  const run = async () => {
    setJobStatus(`enhance-${mediaId}`, "running");
    try {
      await aiEnhanceFace(mediaId);
      setJobStatus(`enhance-${mediaId}`, "done");
    } catch (e: unknown) {
      setJobStatus(`enhance-${mediaId}`, "error", undefined, extractError(e));
    }
  };

  return (
    <>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
        Enhances facial detail using GFPGAN (if installed) or FFmpeg sharpening as fallback.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <RunBtn onClick={run} running={job?.status === "running"} label="Enhance Faces" />
        <Badge status={job?.status ?? "idle"} />
      </div>
      {job?.error && <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{job.error}</p>}
    </>
  );
}

function TrackPanel({ mediaId }: { mediaId: string }) {
  const { setJobStatus, jobs } = useAIStore();
  const [bbox, setBbox] = useState({ x: 100, y: 100, w: 200, h: 200 });
  const job = jobs[`track-${mediaId}`];
  const result = job?.result as { tracks: { frame: number; success: boolean }[] } | undefined;

  const run = async () => {
    setJobStatus(`track-${mediaId}`, "running");
    try {
      const res = await aiTrackObject(mediaId, [bbox.x, bbox.y, bbox.w, bbox.h]);
      setJobStatus(`track-${mediaId}`, "done", res.data);
    } catch (e: unknown) {
      setJobStatus(`track-${mediaId}`, "error", undefined, extractError(e));
    }
  };

  return (
    <>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
        Track a subject through the video. Set the initial bounding box (x, y, width, height in pixels) for frame 0. Requires <code>pip install opencv-python</code>.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {(["x", "y", "w", "h"] as const).map(k => (
          <div key={k}>
            <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 2px", textTransform: "uppercase" }}>{k}</p>
            <input type="number" value={bbox[k]} onChange={e => setBbox(b => ({ ...b, [k]: Number(e.target.value) }))}
              style={{ width: "100%", padding: "4px 6px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <RunBtn onClick={run} running={job?.status === "running"} label="Track Object" />
        <Badge status={job?.status ?? "idle"} />
      </div>
      {result && (
        <p style={{ fontSize: 11, color: "var(--success)", margin: 0 }}>
          Tracked {result.tracks.length} frames · {result.tracks.filter(t => t.success).length} successful
        </p>
      )}
      {job?.error && <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{job.error}</p>}
    </>
  );
}

function GeneratePanel() {
  const { setJobStatus, setGeneratedVideo, jobs, generatedVideoUrl } = useAIStore();
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(4);
  const [apiToken, setApiToken] = useState("");
  const job = jobs["generate"];

  const run = async () => {
    if (!prompt.trim()) return;
    setJobStatus("generate", "running");
    try {
      const res = await aiGenerateVideo(prompt, duration, apiToken || undefined);
      const url = (res.data as { url: string }).url;
      setGeneratedVideo(url);
      setJobStatus("generate", "done", res.data);
    } catch (e: unknown) {
      setJobStatus("generate", "error", undefined, extractError(e));
    }
  };

  return (
    <>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
        Generate video from a text prompt using Replicate API. Requires a free <strong style={{ color: "var(--text-primary)" }}>REPLICATE_API_TOKEN</strong> (replicate.com).
      </p>
      <textarea
        value={prompt} onChange={e => setPrompt(e.target.value)}
        placeholder="Describe the video you want to generate…"
        rows={3}
        style={{ width: "100%", padding: "8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, resize: "vertical", fontFamily: "inherit" }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 3px" }}>Duration (s)</p>
          <input type="number" value={duration} min={2} max={16} onChange={e => setDuration(Number(e.target.value))}
            style={{ width: "100%", padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12 }} />
        </div>
        <div>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 3px" }}>API Token (or set env var)</p>
          <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)}
            placeholder="r8_..."
            style={{ width: "100%", padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12 }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <RunBtn onClick={run} running={job?.status === "running"} disabled={!prompt.trim()} label="✨ Generate Video" />
        <Badge status={job?.status ?? "idle"} />
      </div>
      {generatedVideoUrl && (
        <div>
          <p style={{ fontSize: 11, color: "var(--success)", margin: "0 0 6px" }}>Generated — click to open:</p>
          <a href={generatedVideoUrl} target="_blank" rel="noreferrer"
            style={{ fontSize: 11, color: "var(--accent)", wordBreak: "break-all" }}>
            {generatedVideoUrl}
          </a>
        </div>
      )}
      {job?.error && <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{job.error}</p>}
    </>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function AITools() {
  const { selectedClipId, clips } = useTimelineStore();
  const { mediaFiles } = useProjectStore();

  const clip  = clips.find(c => c.id === selectedClipId) ?? null;
  const media = clip ? mediaFiles.find(f => f.id === clip.media_id) ?? null : null;
  const mediaId = media ? String(media.id) : null;

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--bg-primary)" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)" }}>
        <h1 style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)", margin: 0 }}>AI Tools</h1>
        {media ? (
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "3px 0 0" }}>
            Working on: <strong style={{ color: "var(--text-primary)" }}>{media.filename}</strong>
          </p>
        ) : (
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "3px 0 0" }}>
            Go to Edit tab, select a clip, then return here.
          </p>
        )}
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Clip-specific tools */}
        <Card icon="💬" title="Auto Captions" desc="Speech-to-text via Whisper — burns subtitles or overlays in preview">
          {mediaId ? <CaptionsPanel mediaId={mediaId} /> : <NoClipNote />}
        </Card>

        <Card icon="✂️" title="Auto Cut (Silence Removal)" desc="Detect and remove silent/filler segments automatically">
          {mediaId && clip?.type === "video" ? <AutoCutPanel mediaId={mediaId} /> : <NoClipNote />}
        </Card>

        <Card icon="🧹" title="Background Removal" desc="AI background removal — no green screen needed (U2Net)">
          {mediaId ? <RemoveBgPanel mediaId={mediaId} /> : <NoClipNote />}
        </Card>

        <Card icon="📱" title="AI Reframing" desc="Convert landscape → vertical (or any ratio) with face-aware cropping">
          {mediaId && clip?.type === "video" ? <ReframePanel mediaId={mediaId} /> : <NoClipNote />}
        </Card>

        <Card icon="✨" title="Face Enhancement" desc="Sharpen and restore facial detail (GFPGAN or FFmpeg fallback)">
          {mediaId ? <EnhancePanel mediaId={mediaId} /> : <NoClipNote />}
        </Card>

        <Card icon="🎯" title="Object Tracking" desc="Track a subject through the video using OpenCV CSRT tracker">
          {mediaId && clip?.type === "video" ? <TrackPanel mediaId={mediaId} /> : <NoClipNote />}
        </Card>

        {/* Standalone tools */}
        <Card icon="🎬" title="AI Video Generation" desc="Generate a video from a text prompt (Replicate API)">
          <GeneratePanel />
        </Card>

        {/* Dependency info */}
        <div style={{ padding: 12, borderRadius: 6, background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 6px" }}>Optional dependencies</p>
          <pre style={{ fontSize: 10, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
{`pip install faster-whisper        # captions
pip install rembg[gpu]            # background removal
pip install opencv-python         # reframe + tracking
pip install gfpgan                # face enhancement
pip install replicate             # AI video generation`}
          </pre>
        </div>
      </div>
    </div>
  );
}
