import { useRef, useState } from "react";
import type { Caption } from "../../types";
import { CaptionOverlay } from "../edit/PreviewPlayer";
import { CropOverlay } from "../edit/CropOverlay";
import type { CropRect } from "../edit/CropOverlay";

interface VideoPlayerProps {
  src:           string;
  onTimeUpdate?: (currentTime: number) => void;
  captions?:     Caption[];
  crop?:         CropRect;
  onCropChange?: (crop: CropRect) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function VideoPlayer({ src, onTimeUpdate, captions, crop, onCropChange }: VideoPlayerProps) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const [playing,     setPlaying]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    playing ? v.pause() : v.play();
    setPlaying(!playing);
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    onTimeUpdate?.(v.currentTime);
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const t = Number(e.target.value);
    v.currentTime = t;
    setCurrentTime(t);
  };

  const activeCaption = captions?.find(
    (c) => currentTime >= c.start && currentTime < c.end
  ) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      {/* Controls on top */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={togglePlay} className="btn btn-secondary"
          style={{ padding: "4px 10px", minWidth: 48 }}>
          {playing ? "Pause" : "Play"}
        </button>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <input type="range" min={0} max={duration || 0} step={0.05} value={currentTime}
          onChange={handleSeek}
          style={{ flex: 1, accentColor: "var(--accent)", cursor: "pointer" }} />
      </div>

      {/* Video + overlays */}
      <div style={{ position: "relative", width: "100%" }}>
        <video
          ref={videoRef}
          src={src}
          style={{ width: "100%", borderRadius: 4, background: "#000", display: "block" }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setPlaying(false)}
        />
        {crop && onCropChange && (
          <CropOverlay crop={crop} onChange={onCropChange} />
        )}
        {activeCaption && (
          <CaptionOverlay
            caption={activeCaption}
            animKey={`${activeCaption.start}-${activeCaption.style?.transition}`}
          />
        )}
      </div>
    </div>
  );
}
