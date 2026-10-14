import { useState, useRef, useCallback } from "react";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { VideoPlayer } from "../shared/VideoPlayer";
import { CropOverlay } from "./CropOverlay";
import { getMediaProxyUrl } from "../../api/client";
import type { Caption, CaptionStyle, CaptionTransition, CaptionPosition } from "../../types";

// ─── constants ────────────────────────────────────────────────────────────────

const FONTS = [
  { label: "System",      value: "Inter, system-ui, sans-serif" },
  { label: "Impact",      value: "Impact, 'Arial Black', sans-serif" },
  { label: "Serif",       value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono",        value: "'Courier New', Courier, monospace" },
  { label: "Arial Black", value: "'Arial Black', Gadget, sans-serif" },
];
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64];
const TRANSITIONS: { value: CaptionTransition; label: string }[] = [
  { value: "none",       label: "None" },
  { value: "fade",       label: "Fade" },
  { value: "slide-up",   label: "Slide Up" },
  { value: "slide-down", label: "Slide Down" },
  { value: "pop",        label: "Pop" },
  { value: "bounce",     label: "Bounce" },
];
const COLORS = ["#ffffff", "#ffff00", "#00eeff", "#ff6b6b", "#a0ff80", "#000000"];
const DEFAULT_STYLE: CaptionStyle = {
  fontSize: 20, fontFamily: "Inter, system-ui, sans-serif",
  bold: false, italic: false, color: "#ffffff",
  bgOpacity: 0.7, transition: "none", position: "bottom",
};

function mergeStyle(s?: Partial<CaptionStyle>): CaptionStyle {
  return { ...DEFAULT_STYLE, ...s };
}

// ─── caption overlay ──────────────────────────────────────────────────────────

export function CaptionOverlay({ caption, animKey }: { caption: Caption; animKey?: string | number }) {
  if (!caption.text) return null;
  const s = mergeStyle(caption.style);
  const ANIM: Record<CaptionTransition, string> = {
    none: "none",
    fade: "caption-fade 0.4s ease both",
    "slide-up":   "caption-slide-up 0.4s ease both",
    "slide-down": "caption-slide-down 0.4s ease both",
    pop:    "caption-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
    bounce: "caption-bounce 0.5s ease both",
  };
  const posStyle: React.CSSProperties =
    s.position === "middle" ? { top: "50%", left: "50%", transform: "translate(-50%,-50%)" }
    : s.position === "top"  ? { top: 16, left: "50%", transform: "translateX(-50%)" }
    :                         { bottom: 16, left: "50%", transform: "translateX(-50%)" };
  return (
    <div key={animKey} style={{
      position: "absolute", pointerEvents: "none", ...posStyle,
      background: `rgba(0,0,0,${s.bgOpacity})`, color: s.color,
      fontSize: s.fontSize, fontFamily: s.fontFamily,
      fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? "italic" : "normal",
      padding: "5px 16px", borderRadius: 4,
      whiteSpace: "pre-wrap", textAlign: "center",
      maxWidth: "90%", lineHeight: 1.4, animation: ANIM[s.transition],
    }}>
      {caption.text}
    </div>
  );
}

// ─── style helpers ────────────────────────────────────────────────────────────

const SEL: React.CSSProperties = {
  background: "var(--bg-primary)", border: "1px solid var(--border)",
  borderRadius: 3, color: "var(--text-primary)", fontSize: 11,
  padding: "2px 5px", cursor: "pointer",
};
function mkBtn(active?: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: active ? "var(--accent)" : "var(--bg-tertiary)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 3, color: active ? "#fff" : "var(--text-secondary)",
    fontSize: 11, padding: "2px 8px", cursor: "pointer", ...extra,
  };
}

// ─── caption editor bar ───────────────────────────────────────────────────────
// caps state lives in PreviewPlayer (lifted) — this component only manages
// which caption is selected and fires onChange for every change.

interface EditorProps {
  caps:     Caption[];
  isImage:  boolean;
  onChange: (caps: Caption[]) => void;
}

function CaptionEditorBar({ caps, isImage, onChange }: EditorProps) {
  const [idx, setIdx] = useState(0);

  const safeIdx = Math.min(idx, Math.max(0, caps.length - 1));
  const cap   = caps[safeIdx] ?? { start: 0, end: isImage ? 9999 : 3, text: "", style: {} };
  const style = mergeStyle(cap.style);

  const patchCap = (patch: Partial<Caption>) =>
    onChange(caps.map((c, i) => i === safeIdx ? { ...c, ...patch } : c));

  const patchStyle = (patch: Partial<CaptionStyle>) =>
    patchCap({ style: { ...cap.style, ...patch } });

  const addCap = () => {
    const lastEnd = caps.length > 0 ? caps[caps.length - 1].end : 0;
    onChange([...caps, { start: lastEnd, end: lastEnd + 3, text: "", style: cap.style }]);
    setIdx(caps.length);
  };

  const deleteCap = () => {
    if (caps.length <= 1) {
      onChange([{ start: 0, end: isImage ? 9999 : 3, text: "", style: {} }]);
      setIdx(0);
    } else {
      onChange(caps.filter((_, i) => i !== safeIdx));
      setIdx(Math.max(0, safeIdx - 1));
    }
  };

  return (
    <div style={{
      flexShrink: 0, background: "var(--bg-secondary)",
      borderTop: "1px solid var(--border)", padding: "8px 12px",
      display: "flex", flexDirection: "column", gap: 7,
    }}>

      {/* Caption text — uncontrolled so React never fights the user's keystrokes */}
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        <span style={{ fontSize: 10, color: "var(--text-secondary)", paddingTop: 6, flexShrink: 0 }}>
          {caps.length > 1 ? `${safeIdx + 1}/${caps.length}` : "Caption"}
        </span>
        <textarea
          key={`ta-${safeIdx}`}
          defaultValue={cap.text}
          placeholder="Type caption text…"
          rows={2}
          onChange={(e) => patchCap({ text: e.target.value })}
          style={{
            flex: 1, background: "var(--bg-primary)",
            border: "1px solid var(--accent)", borderRadius: 4,
            color: "var(--text-primary)", fontSize: 13,
            fontFamily: style.fontFamily,
            fontWeight: style.bold   ? 700 : 400,
            fontStyle:  style.italic ? "italic" : "normal",
            padding: "5px 8px", resize: "none", outline: "none", lineHeight: 1.4,
          }}
        />
      </div>

      {/* Style controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <select value={style.fontFamily} style={SEL}
          onChange={(e) => patchStyle({ fontFamily: e.target.value })}>
          {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select value={style.fontSize} style={SEL}
          onChange={(e) => patchStyle({ fontSize: Number(e.target.value) })}>
          {FONT_SIZES.map((sz) => <option key={sz} value={sz}>{sz}px</option>)}
        </select>
        <button style={mkBtn(style.bold,   { fontWeight: 700, minWidth: 26 })}
          onClick={() => patchStyle({ bold: !style.bold })}>B</button>
        <button style={mkBtn(style.italic, { fontStyle: "italic", minWidth: 26 })}
          onClick={() => patchStyle({ italic: !style.italic })}>I</button>
        {COLORS.map((c) => (
          <div key={c} onClick={() => patchStyle({ color: c })} title={c} style={{
            width: 16, height: 16, borderRadius: "50%", background: c,
            flexShrink: 0, cursor: "pointer",
            border: `2px solid ${style.color === c ? "var(--accent)" : "rgba(255,255,255,0.15)"}`,
            boxShadow: style.color === c ? "0 0 0 2px var(--accent)" : "none",
          }} />
        ))}
        <div style={{ width: 1, height: 14, background: "var(--border)", flexShrink: 0 }} />
        <select value={style.position} style={SEL}
          onChange={(e) => patchStyle({ position: e.target.value as CaptionPosition })}>
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
        <select value={style.transition} style={SEL}
          onChange={(e) => patchStyle({ transition: e.target.value as CaptionTransition })}>
          {TRANSITIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={style.bgOpacity} style={SEL}
          onChange={(e) => patchStyle({ bgOpacity: Number(e.target.value) })}>
          <option value={0}>No BG</option>
          <option value={0.45}>BG 45%</option>
          <option value={0.72}>BG 72%</option>
          <option value={1}>BG Solid</option>
        </select>
      </div>

      {/* Timing + navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {!isImage && (
          <>
            <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Start</span>
            <input type="number" min={0} step={0.1}
              key={`s-${safeIdx}`} defaultValue={cap.start}
              onChange={(e) => patchCap({ start: Number(e.target.value) })}
              style={{ ...SEL, width: 54 }} />
            <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>End</span>
            <input type="number" min={0} step={0.1}
              key={`e-${safeIdx}`} defaultValue={cap.end}
              onChange={(e) => patchCap({ end: Number(e.target.value) })}
              style={{ ...SEL, width: 54 }} />
          </>
        )}
        <div style={{ flex: 1 }} />
        {caps.length > 1 && (
          <>
            <button disabled={safeIdx === 0} style={mkBtn()}
              onClick={() => setIdx(Math.max(0, safeIdx - 1))}>←</button>
            <button disabled={safeIdx === caps.length - 1} style={mkBtn()}
              onClick={() => setIdx(Math.min(caps.length - 1, safeIdx + 1))}>→</button>
          </>
        )}
        <button onClick={addCap}    style={mkBtn(false, { color: "var(--success)" })}>+ Add</button>
        <button onClick={deleteCap} style={mkBtn(false, { color: "var(--error)" })}>✕ Del</button>
      </div>
    </div>
  );
}

// ─── main preview player ──────────────────────────────────────────────────────

export function PreviewPlayer() {
  const { selectedClipId, clips, updateClip } = useTimelineStore();
  const { mediaFiles } = useProjectStore();

  const clip  = clips.find((c) => c.id === selectedClipId) ?? null;
  const media = clip ? mediaFiles.find((f) => f.id === clip.media_id) ?? null : null;

  // Caps state lives HERE so the overlay and editor share the same array
  const [caps, setCaps] = useState<Caption[]>([]);

  // Seed from Zustand whenever the selected clip changes.
  // Use a normalised string (never undefined) so the !== check is stable.
  const prevClipId = useRef<string | null>(null);
  const currentClipId = clip?.id ?? null;
  if (currentClipId !== prevClipId.current) {
    prevClipId.current = currentClipId;
    setCaps(clip?.captions?.length ? clip.captions : []);
  }

  // Persist to Zustand — using a ref so onChange never becomes stale
  const clipIdRef = useRef<string | null>(null);
  clipIdRef.current = clip?.id ?? null;
  const persist = useCallback((next: Caption[]) => {
    if (clipIdRef.current) updateClip(clipIdRef.current, { captions: next });
  }, [updateClip]);

  const handleChange = useCallback((next: Caption[]) => {
    setCaps(next);
    persist(next);
  }, [persist]);

  if (!clip || !media) {
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        width: "100%", height: "100%",
        gap: 12, color: "var(--text-secondary)",
      }}>
        <span style={{ fontSize: 48 }}>▶</span>
        <p style={{ fontSize: 13 }}>Select a clip to preview</p>
      </div>
    );
  }

  const proxyUrl = getMediaProxyUrl(media.id);
  const crop    = clip.crop ?? { x: 0, y: 0, w: 100, h: 100 };
  const isImage = media.media_type === "image";
  const handleCropChange = (c: typeof crop) => updateClip(clip.id, { crop: c });

  // For images show any caption that has text; for video VideoPlayer
  // filters by currentTime internally.
  const imageCaption = isImage ? (caps.find((c) => c.text) ?? null) : null;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      width: "100%", height: "100%",
      background: "#000", overflow: "hidden",
    }}>
      {/* Media area */}
      <div style={{
        flexShrink: 0, maxHeight: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 10, overflow: "hidden",
      }}>
        {isImage ? (
          <div style={{ position: "relative", maxWidth: "100%", maxHeight: 280, lineHeight: 0 }}>
            <img src={proxyUrl} alt={media.filename}
              style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain",
                borderRadius: 4, display: "block" }} />
            <CropOverlay crop={crop} onChange={handleCropChange} />
            {imageCaption && (
              <CaptionOverlay caption={imageCaption}
                animKey={`${imageCaption.text}-${imageCaption.style?.transition}`} />
            )}
          </div>
        ) : (
          <div style={{ width: "100%", maxHeight: 280, overflow: "hidden" }}>
            <VideoPlayer src={proxyUrl} captions={caps}
              crop={crop} onCropChange={handleCropChange} />
          </div>
        )}
      </div>

      {/* Caption editor — key resets idx when clip changes */}
      <CaptionEditorBar
        key={clip.id}
        caps={caps.length ? caps : [{ start: 0, end: isImage ? 9999 : 3, text: "", style: {} }]}
        isImage={isImage}
        onChange={handleChange}
      />
    </div>
  );
}
