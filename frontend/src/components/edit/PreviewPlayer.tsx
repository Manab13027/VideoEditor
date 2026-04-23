import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { useAIStore } from "../../stores/aiStore";
import { VideoPlayer } from "../shared/VideoPlayer";
import { CropOverlay } from "./CropOverlay";
import { getMediaProxyUrl } from "../../api/client";
import type { Clip, FilterPreset } from "../../types";

function buildCSSFilter(clip: Clip): string {
  const presetMap: Record<FilterPreset, string> = {
    grayscale:   "grayscale(1)",
    sepia:       "sepia(0.8)",
    vintage:     "sepia(0.4) contrast(0.9) brightness(0.95) saturate(0.7)",
    vivid:       "saturate(1.5) contrast(1.1)",
    cool:        "hue-rotate(200deg) saturate(0.9)",
    warm:        "hue-rotate(340deg) saturate(1.2) brightness(1.05)",
    teal_orange: "saturate(1.3) contrast(1.1) hue-rotate(10deg)",
    matte:       "contrast(0.85) brightness(1.05) saturate(0.75)",
    film_noir:   "grayscale(1) contrast(1.4) brightness(0.88)",
    golden:      "sepia(0.25) saturate(1.4) brightness(1.08) hue-rotate(5deg)",
    cyberpunk:   "saturate(2) contrast(1.25) hue-rotate(280deg)",
    faded:       "contrast(0.88) brightness(1.12) saturate(0.8)",
  };

  if (clip.filter) return presetMap[clip.filter] ?? "";

  const c = clip.color;
  const parts: string[] = [];
  if (c) {
    if (Math.abs(c.brightness - 1) > 0.01) parts.push(`brightness(${c.brightness})`);
    if (Math.abs(c.contrast   - 1) > 0.01) parts.push(`contrast(${c.contrast})`);
    if (Math.abs(c.saturation - 1) > 0.01) parts.push(`saturate(${c.saturation})`);
    if (Math.abs(c.hue)            > 0.5)  parts.push(`hue-rotate(${c.hue}deg)`);
  }
  return parts.join(" ");
}

function buildCSSEffects(clip: Clip): { filter: string; animation: string } {
  const fx = clip.effects ?? {};
  const filterParts: string[] = [];

  if ((fx.motion_blur ?? 0) > 0.01) {
    filterParts.push(`blur(${(fx.motion_blur! * 3).toFixed(1)}px)`);
  }
  if ((fx.glow ?? 0) > 0.01) {
    const g = fx.glow!;
    filterParts.push(`brightness(${1 + g * 0.3}) drop-shadow(0 0 ${(g * 12).toFixed(0)}px rgba(255,255,255,${(g * 0.6).toFixed(2)}))`);
  }

  const animation = (fx.shake ?? 0) > 0.01
    ? `shake ${(0.3 - fx.shake! * 0.2).toFixed(2)}s infinite`
    : "";

  return { filter: filterParts.join(" "), animation };
}

export function PreviewPlayer() {
  const { selectedClipId, clips, updateClip, cropMode, setCropMode, cropAspectRatio, setCurrentPreviewTime, currentPreviewTime } = useTimelineStore();
  const { mediaFiles, proxyBusts } = useProjectStore();
  const { captions, showCaptions } = useAIStore();

  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  const media = clip ? mediaFiles.find((f) => f.id === clip.media_id) ?? null : null;

  if (!clip || !media) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", gap: 12, color: "var(--text-secondary)" }}>
        <span style={{ fontSize: 48 }}>▶</span>
        <p style={{ fontSize: 13 }}>Select a clip to preview</p>
      </div>
    );
  }

  const proxyUrl   = getMediaProxyUrl(media.id, proxyBusts[media.id]);

  const mediaIdStr = String(media.id);
  const activeCaption = showCaptions
    ? (captions[mediaIdStr] ?? []).find(
        (seg) => currentPreviewTime >= seg.start && currentPreviewTime <= seg.end
      )
    : null;
  const crop       = clip.crop ?? { x: 0, y: 0, w: 100, h: 100 };
  const cssFilter  = buildCSSFilter(clip);
  const cssEffects = buildCSSEffects(clip);
  const rotate     = clip.rotate ?? 0;

  const combinedFilter = [cssFilter, cssEffects.filter].filter(Boolean).join(" ");

  const cropOverlay = cropMode ? (
    <CropOverlay crop={crop} aspectRatio={cropAspectRatio} onChange={(newCrop) => updateClip(clip.id, { crop: newCrop })} />
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#000" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <button
          onClick={() => setCropMode(!cropMode)}
          style={{
            padding: "4px 10px", fontSize: 12,
            background: cropMode ? "var(--accent)" : "rgba(255,255,255,0.1)",
            border: cropMode ? "none" : "1px solid rgba(255,255,255,0.15)",
            borderRadius: 4, color: "#fff", cursor: "pointer", fontWeight: cropMode ? 600 : 400,
          }}
        >
          ✂ {cropMode ? "Cropping — Apply in panel" : "Crop"}
        </button>
        {cropMode && (
          <button
            onClick={() => setCropMode(false)}
            style={{ padding: "4px 10px", fontSize: 12, background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}
          >
            Cancel
          </button>
        )}
        {clip.filter && (
          <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: "auto" }}>{clip.filter}</span>
        )}
        {clip.reversed && (
          <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: "auto" }}>◀ reversed</span>
        )}
      </div>

      {/* Shake keyframes injected inline */}
      {cssEffects.animation && (
        <style>{`@keyframes shake { 0%,100%{transform:translate(0,0)} 25%{transform:translate(-${Math.round((clip.effects?.shake??0)*6)}px,${Math.round((clip.effects?.shake??0)*4)}px)} 75%{transform:translate(${Math.round((clip.effects?.shake??0)*6)}px,-${Math.round((clip.effects?.shake??0)*3)}px)} }`}</style>
      )}

      {/* Media */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "hidden", position: "relative" }}>
        {media.media_type === "image" ? (
          <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", maxHeight: "100%", animation: cssEffects.animation || undefined }}>
            <img
              src={proxyUrl}
              alt={media.filename}
              style={{ maxWidth: "100%", maxHeight: "60vh", display: "block", objectFit: "contain", filter: combinedFilter || undefined, transform: rotate ? `rotate(${rotate}deg)` : undefined }}
            />
            {cropOverlay}
          </div>
        ) : (
          <div style={{ width: "100%", maxHeight: "100%", animation: cssEffects.animation || undefined }}>
            <VideoPlayer
              src={proxyUrl}
              overlayContent={cropOverlay}
              trimStart={clip.trim_start}
              trimEnd={clip.trim_end ?? undefined}
              speed={clip.speed}
              cssFilter={combinedFilter}
              rotate={rotate as 0 | 90 | 180 | 270}
              onTimeUpdate={setCurrentPreviewTime}
            />
          </div>
        )}

        {/* Caption overlay */}
        {activeCaption && (
          <div style={{
            position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.7)", color: "#fff", padding: "4px 14px",
            borderRadius: 4, fontSize: 14, fontWeight: 500, textAlign: "center",
            maxWidth: "80%", pointerEvents: "none",
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
          }}>
            {activeCaption.text}
          </div>
        )}
      </div>
    </div>
  );
}
