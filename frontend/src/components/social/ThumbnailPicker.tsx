import { useRef, useState, useEffect } from "react";
import { useSocialStore } from "../../stores/socialStore";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { getMediaProxyUrl, socialThumbnail, socialThumbnailSuggest } from "../../api/client";

interface Suggestion { timestamp: number; url: string; }

export function ThumbnailPicker() {
  const { metadata, setMetadata } = useSocialStore();
  const { selectedClipId, clips } = useTimelineStore();
  const { mediaFiles } = useProjectStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayText, setOverlayText] = useState(metadata.title);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  const media = clip ? mediaFiles.find((f) => f.id === clip.media_id) ?? null : null;

  useEffect(() => {
    if (!media?.id || clip?.type !== "video") return;
    socialThumbnailSuggest(media.id)
      .then((res) => setSuggestions((res.data as { suggestions: Suggestion[] }).suggestions))
      .catch(() => {});
  }, [media?.id, clip?.type]);

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    if (showOverlay && overlayText) {
      const fontSize = Math.round(canvas.width / 22);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, canvas.height - fontSize * 3, canvas.width, fontSize * 3);
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText(overlayText, canvas.width / 2, canvas.height - fontSize * 0.8);
    }
  };

  const seekTo = (t: number) => {
    setMetadata({ thumbnailTime: t });
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  if (!clip || !media || clip.type !== "video") {
    return (
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
        Select a video clip in the Edit tab first.
      </p>
    );
  }

  const proxyUrl = getMediaProxyUrl(media.id);
  const duration = media.duration_seconds ?? 100;

  const exportUrl =
    metadata.thumbnailTime != null
      ? socialThumbnail(
          media.id,
          metadata.thumbnailTime,
          showOverlay && overlayText ? overlayText : undefined
        )
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <video
        ref={videoRef}
        src={proxyUrl}
        style={{ display: "none" }}
        onSeeked={captureFrame}
      />

      {/* Canvas preview */}
      <div
        style={{
          width: "100%",
          aspectRatio: "16/9",
          background: "#000",
          borderRadius: 6,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
        {metadata.thumbnailTime == null && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
              fontSize: 11,
            }}
          >
            Scrub below to pick a frame
          </div>
        )}
      </div>

      {/* Scrubber */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={metadata.thumbnailTime ?? 0}
          onChange={(e) => seekTo(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
        <span style={{ fontSize: 10, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          {(metadata.thumbnailTime ?? 0).toFixed(1)}s
        </span>
      </div>

      {/* Auto-suggested frames */}
      {suggestions.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 4px" }}>
            Auto-suggested frames
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            {suggestions.map(({ timestamp, url }) => (
              <div
                key={timestamp}
                onClick={() => seekTo(timestamp)}
                style={{
                  flex: 1,
                  aspectRatio: "16/9",
                  borderRadius: 4,
                  cursor: "pointer",
                  background: `url(${url}) center/cover no-repeat`,
                  border:
                    metadata.thumbnailTime === timestamp
                      ? "2px solid var(--accent)"
                      : "1px solid var(--border)",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Overlay toggle */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={showOverlay}
          onChange={(e) => {
            setShowOverlay(e.target.checked);
            setTimeout(captureFrame, 0);
          }}
          style={{ accentColor: "var(--accent)" }}
        />
        Show title overlay
      </label>
      {showOverlay && (
        <input
          value={overlayText}
          onChange={(e) => {
            setOverlayText(e.target.value);
            captureFrame();
          }}
          placeholder="Overlay text..."
          style={{
            padding: "5px 8px",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text-primary)",
            fontSize: 12,
          }}
        />
      )}

      {/* Export */}
      <a
        href={exportUrl ?? "#"}
        download={`thumbnail_${Math.round(metadata.thumbnailTime ?? 0)}s.png`}
        onClick={(e) => {
          if (!exportUrl) e.preventDefault();
        }}
        style={{
          display: "block",
          textAlign: "center",
          padding: "6px 0",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          background: exportUrl ? "var(--accent)" : "var(--bg-tertiary)",
          color: exportUrl ? "#fff" : "var(--text-secondary)",
          textDecoration: "none",
          cursor: exportUrl ? "pointer" : "not-allowed",
        }}
      >
        Export PNG
      </a>
    </div>
  );
}
