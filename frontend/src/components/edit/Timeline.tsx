import { useState, useRef, useEffect } from "react";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { useAudioStore } from "../../stores/audioStore";
import { Storyboard } from "./Storyboard";

// navigate to export tab
function useGoToExport() {
  const { setActiveTab } = useProjectStore();
  return () => setActiveTab("export");
}

const ZOOM_LEVELS = [0.1, 0.25, 0.5, 1, 2] as const;
type ZoomLevel = typeof ZOOM_LEVELS[number];

const TRACK_HEIGHT = 56;

const LABEL_W = 100;
const VIDEO_H = 72;   // video/image clip block height
const AUDIO_H = 28;   // audio strip height
const ROW_PAD = 8;    // padding above/below clips in a row

function MultiTrack({ zoom }: { zoom: number }) {
  const { clips, selectedClipId, selectClip, removeClip, insertClipAt, reorderClips } = useTimelineStore();
  const { mediaFiles } = useProjectStore();
  const { tracks: audioTracks, addTrack, removeTrack, updateTrack, muteOriginal, setMuteOriginal } = useAudioStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag-to-reorder state
  const dragRef = useRef<{ clipId: string; fromIdx: number; toIdx: number } | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [dragGhost, setDragGhost] = useState<{ clipId: string; fromIdx: number; dx: number } | null>(null);

  // Shared pixels-per-second for ALL tracks
  const PPS = 80 * zoom;

  const sorted = [...clips].sort((a, b) => a.order - b.order);

  // Video clip clipboard
  const [clipboard, setClipboard] = useState<typeof sorted[number] | null>(null);
  // Audio track clipboard + selection
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [audioClipboard, setAudioClipboard] = useState<(typeof audioTracks)[number] | null>(null);

  // Compute clip durations and cumulative start times
  const clipDurs = sorted.map((clip) => {
    const media = mediaFiles.find((f) => f.id === clip.media_id);
    return clip.type === "image"
      ? (clip.duration ?? 5)
      : clip.trim_end != null
      ? clip.trim_end - clip.trim_start
      : (media?.duration_seconds ?? 5);
  });
  const clipStarts: number[] = [];
  let cur = 0;
  for (const d of clipDurs) { clipStarts.push(cur); cur += d; }
  const videoDur = cur;
  const totalDur = Math.max(
    videoDur,
    ...audioTracks.map((t) => t.offset + (t.duration ?? 30)),
    10
  );
  const canvasW = Math.ceil(totalDur * PPS) + 60;

  // Time ruler
  const tickStep = PPS >= 80 ? 1 : PPS >= 30 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= totalDur + tickStep; t += tickStep) ticks.push(t);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  // Audio drag: move or resize
  const handleAudioDrag = (
    e: React.MouseEvent, trackId: string,
    curOffset: number, curDur: number, mode: "move" | "resize"
  ) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const onMove = (me: MouseEvent) => {
      const dx = me.clientX - startX;
      if (mode === "move")
        updateTrack(trackId, { offset: Math.max(0, Math.round((curOffset + dx / PPS) * 10) / 10) });
      else
        updateTrack(trackId, { duration: Math.max(1, Math.round((curDur + dx / PPS) * 10) / 10) });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Drop handler — uses drop x-position for audio offset
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData("media_id");
    const mediaType = e.dataTransfer.getData("media_type") as "video" | "image" | "audio";
    if (!mediaId) return;
    const media = mediaFiles.find((f) => String(f.id) === mediaId);
    if (!media) return;

    if (mediaType === "audio") {
      const rect = scrollRef.current!.getBoundingClientRect();
      const dropOffset = Math.max(0, Math.round(((e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0)) / PPS) * 10) / 10);
      addTrack({
        id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: "music", mediaId: String(media.id), name: media.filename,
        volume: 1.0, offset: dropOffset, muted: false, waveform: [],
        duration: media.duration_seconds ?? 30,
      });
    } else {
      insertClipAt({
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        media_id: media.id,
        type: mediaType === "image" ? "image" : "video",
        trim_start: 0, trim_end: media.duration_seconds ?? null,
        crop: null, speed: 1,
        duration: mediaType === "image" ? 5 : null,
      }, sorted.length);
    }
  };

  // Clip drag-to-reorder
  const handleClipMouseDown = (e: React.MouseEvent, clipId: string) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    e.preventDefault();
    const fromIdx = sorted.findIndex((c) => c.id === clipId);
    dragRef.current = { clipId, fromIdx, toIdx: fromIdx };
    const startX = e.clientX;

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = me.clientX - startX;
      // Update ghost position
      setDragGhost({ clipId, fromIdx, dx });

      // Compute insertion index using ghost center vs other clips' midpoints
      const ghostCenter = clipStarts[fromIdx] * PPS + dx + (clipDurs[fromIdx] * PPS) / 2;
      let insertIdx = 0;
      for (let j = 0; j < sorted.length; j++) {
        if (j === fromIdx) continue;
        const mid = (clipStarts[j] + clipDurs[j] / 2) * PPS;
        if (ghostCenter > mid) insertIdx = j + 1;
      }
      // Adjust: after splicing out fromIdx, indices after it shift down by 1
      if (insertIdx > fromIdx) insertIdx--;
      dragRef.current.toIdx = insertIdx;
      setDropAt(insertIdx);
    };

    const onUp = () => {
      if (dragRef.current && dragRef.current.toIdx !== dragRef.current.fromIdx) {
        const { fromIdx: fi, toIdx: ti } = dragRef.current;
        const reordered = [...sorted];
        const [moved] = reordered.splice(fi, 1);
        reordered.splice(ti, 0, moved);
        reorderClips(reordered.map((c, i) => ({ ...c, order: i })));
      }
      dragRef.current = null;
      setDragGhost(null);
      setDropAt(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Ctrl+C / Ctrl+V keyboard handler (video clips + audio tracks)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key === "c") {
        // Copy video clip
        if (selectedClipId) {
          const clip = sorted.find((c) => c.id === selectedClipId);
          if (clip) { setClipboard(clip); setAudioClipboard(null); }
        }
        // Copy audio track
        if (selectedAudioId) {
          const track = audioTracks.find((t) => t.id === selectedAudioId);
          if (track) { setAudioClipboard(track); setClipboard(null); }
        }
      }

      if (e.key === "v") {
        // Paste video clip
        if (clipboard) {
          const insertIdx = selectedClipId
            ? sorted.findIndex((c) => c.id === selectedClipId) + 1
            : sorted.length;
          insertClipAt(
            { ...clipboard, id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
            Math.min(insertIdx, sorted.length)
          );
        }
        // Paste audio track — shift offset by 0.5s so it doesn't perfectly overlap
        if (audioClipboard) {
          addTrack({
            ...audioClipboard,
            id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            offset: Math.round((audioClipboard.offset + 0.5) * 10) / 10,
          });
        }
      }

      // Delete selected audio track
      if ((e.key === "Delete" || e.key === "Backspace") && selectedAudioId) {
        removeTrack(selectedAudioId);
        setSelectedAudioId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedClipId, clipboard, sorted, insertClipAt, selectedAudioId, audioClipboard, audioTracks, addTrack, removeTrack]);

  // Row heights
  const videoRowH = VIDEO_H + ROW_PAD * 2;
  const audioRowH = 72;  // enough for track name + 2 fade sliders
  const totalH = videoRowH + (audioTracks.length > 0 ? audioTracks.length * audioRowH : audioRowH);

  // Renders a compact labelled slider for fade_in / fade_out
  const FadeSlider = ({
    trackId, field, value, icon,
  }: {
    trackId: string; field: "fade_in" | "fade_out"; value: number; icon: string;
  }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
      <span style={{ fontSize: 9, color: "var(--text-secondary)", width: 14, flexShrink: 0 }}>{icon}</span>
      <input
        type="range" min={0} max={5} step={0.1}
        value={value}
        onChange={(e) => updateTrack(trackId, { [field]: Number(e.target.value) })}
        style={{ flex: 1, height: 3, accentColor: field === "fade_in" ? "#533483" : "#e94560", cursor: "pointer" }}
      />
      <span style={{ fontSize: 9, color: "var(--text-primary)", width: 24, textAlign: "right", flexShrink: 0 }}>
        {value.toFixed(1)}s
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── Fixed left label column ── */}
      <div style={{
        width: LABEL_W, flexShrink: 0, borderRight: "1px solid var(--border)",
        background: "var(--bg-secondary)", display: "flex", flexDirection: "column",
        paddingTop: 24, overflow: "hidden", // align with ruler height
      }}>
        {/* Video/Image row label */}
        <div style={{
          height: videoRowH, borderBottom: "1px solid var(--border)",
          display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "0 10px", gap: 4,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 12 }}>🎥</span>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Video</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 12 }}>🖼</span>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Image</span>
          </div>
        </div>
        {/* Audio row labels */}
        {audioTracks.length === 0 ? (
          <div style={{ height: audioRowH, display: "flex", alignItems: "center", padding: "0 10px", gap: 5 }}>
            <span style={{ fontSize: 12 }}>🎵</span>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Audio</span>
          </div>
        ) : (
          audioTracks.map((t) => (
            <div key={t.id} style={{
              height: audioRowH, borderBottom: "1px solid var(--border)",
              display: "flex", flexDirection: "column", justifyContent: "center",
              padding: "4px 8px", gap: 2,
            }}>
              {/* Track name + mute */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <button onClick={() => updateTrack(t.id, { muted: !t.muted })}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>
                  {t.muted ? "🔇" : "🔊"}
                </button>
                <span style={{
                  fontSize: 9, color: t.muted ? "#f87171" : "var(--text-secondary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                }}>{t.name}</span>
              </div>
              {/* Fade sliders */}
              <FadeSlider trackId={t.id} field="fade_in"  value={t.fade_in  ?? 0} icon="▶︎" />
              <FadeSlider trackId={t.id} field="fade_out" value={t.fade_out ?? 0} icon="⏹" />
            </div>
          ))
        )}
        {/* Mute original video audio toggle */}
        <div style={{
          marginTop: "auto", borderTop: "1px solid var(--border)",
          padding: "6px 8px",
        }}>
          <button
            onClick={() => setMuteOriginal(!muteOriginal)}
            title="Mute the original audio from video files"
            style={{
              width: "100%", padding: "4px 0", fontSize: 9, borderRadius: 3,
              border: `1px solid ${muteOriginal ? "var(--accent)" : "var(--border)"}`,
              background: muteOriginal ? "rgba(233,69,96,0.15)" : "transparent",
              color: muteOriginal ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer", textAlign: "center",
            }}
          >
            {muteOriginal ? "🔇 Vid muted" : "🔊 Vid audio"}
          </button>
        </div>
      </div>

      {/* ── Unified scrollable canvas ── */}
      <div ref={scrollRef} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}
        style={{ flex: 1, overflowX: "auto", overflowY: "auto", position: "relative", height: "100%" }}>
        <div style={{ position: "relative", width: canvasW }}>

          {/* Time ruler */}
          <div style={{
            position: "sticky", top: 0, zIndex: 10,
            height: 24, background: "var(--bg-tertiary)", borderBottom: "1px solid var(--border)",
          }}>
            {ticks.map((t) => (
              <div key={t} style={{ position: "absolute", left: t * PPS, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 9, color: "var(--text-secondary)", paddingLeft: 3 }}>{fmt(t)}</span>
                <div style={{ position: "absolute", bottom: 0, left: 0, width: 1, height: 5, background: "var(--border)" }} />
              </div>
            ))}
          </div>

          {/* ── Video + Image row — both on the same horizontal band ── */}
          <div style={{
            position: "relative", height: videoRowH,
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-primary)",
          }}>
            {/* grid lines at each second */}
            {ticks.map((t) => (
              <div key={t} style={{ position: "absolute", left: t * PPS, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.04)" }} />
            ))}
            {/* empty hint */}
            {sorted.length === 0 && (
              <span style={{ position: "absolute", top: "50%", left: 12, transform: "translateY(-50%)", fontSize: 11, color: "var(--text-secondary)" }}>
                Drag video or image files here to build your reel
              </span>
            )}
            {/* Drop indicator */}
            {dropAt !== null && sorted.length > 0 && (
              <div style={{
                position: "absolute",
                left: (dropAt < sorted.length
                  ? clipStarts[dropAt] * PPS
                  : (clipStarts[sorted.length - 1] + clipDurs[sorted.length - 1]) * PPS) - 2,
                top: 0, bottom: 0, width: 3,
                background: "var(--accent)", borderRadius: 2, zIndex: 10,
                pointerEvents: "none",
              }} />
            )}
            {sorted.map((clip, i) => {
              const startPx = clipStarts[i] * PPS;
              const durPx = Math.max(clipDurs[i] * PPS - 2, 20);
              const media = mediaFiles.find((f) => f.id === clip.media_id);
              const isSelected = clip.id === selectedClipId;
              const isVideo = clip.type === "video";
              const isBeingDragged = dragGhost?.clipId === clip.id;
              const ghostLeft = isBeingDragged ? startPx + dragGhost.dx : startPx;

              const clipStyle = {
                position: "absolute" as const,
                top: ROW_PAD,
                width: durPx,
                height: VIDEO_H,
                borderRadius: 6,
                display: "flex", flexDirection: "column" as const, justifyContent: "center",
                paddingLeft: 8, userSelect: "none" as const, overflow: "hidden",
              };

              return (
                <div key={clip.id}>
                  {/* Placeholder slot — shown as dashed outline while dragging */}
                  {isBeingDragged && (
                    <div style={{
                      ...clipStyle,
                      left: startPx,
                      background: "transparent",
                      border: "2px dashed rgba(255,255,255,0.2)",
                      pointerEvents: "none",
                    }} />
                  )}
                  {/* Actual clip (or ghost moving with mouse) */}
                  <div
                    onClick={() => selectClip(clip.id)}
                    onMouseDown={(e) => handleClipMouseDown(e, clip.id)}
                    style={{
                      ...clipStyle,
                      left: ghostLeft,
                      background: isVideo ? "linear-gradient(135deg,#1e3a5f,#0f2540)" : "linear-gradient(135deg,#3b1f5e,#1e0f40)",
                      border: `2px solid ${isSelected ? "var(--accent)" : isVideo ? "#2a5080" : "#5a2e8a"}`,
                      cursor: isBeingDragged ? "grabbing" : "grab",
                      opacity: isBeingDragged ? 0.85 : 1,
                      boxShadow: isBeingDragged ? "0 8px 24px rgba(0,0,0,0.6)" : isSelected ? "0 0 0 2px var(--accent)" : "none",
                      zIndex: isBeingDragged ? 20 : 1,
                      transition: isBeingDragged ? "none" : "box-shadow 0.15s",
                    }}>
                    <span style={{ fontSize: 14, marginBottom: 3 }}>{isVideo ? "🎥" : "🖼"}</span>
                    <span style={{ fontSize: 10, color: isVideo ? "#90c4f0" : "#c4a0f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: durPx - 30 }}>
                      {media?.filename ?? clip.media_id}
                    </span>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {clipDurs[i].toFixed(1)}s
                    </span>
                    <button onClick={(ev) => { ev.stopPropagation(); removeClip(clip.id); }}
                      style={{ position: "absolute", top: 3, right: 3, width: 16, height: 16, borderRadius: "50%", background: "rgba(200,50,50,0.85)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Audio strips — each track is a thin row directly below ── */}
          {audioTracks.length === 0 ? (
            <div style={{ height: audioRowH, display: "flex", alignItems: "center", padding: "0 12px", background: "rgba(26,61,46,0.15)", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                🎵 Drop audio files here — they'll play over your video/images
              </span>
            </div>
          ) : (
            audioTracks.map((t) => {
              const dur = t.duration ?? 30;
              const leftPx = t.offset * PPS;
              const widthPx = Math.max(dur * PPS - 2, 30);
              return (
                <div key={t.id} style={{
                  position: "relative", height: audioRowH,
                  background: t.muted ? "rgba(42,32,32,0.4)" : "rgba(26,61,46,0.25)",
                  borderBottom: "1px solid var(--border)",
                }}>
                  {ticks.map((tk) => (
                    <div key={tk} style={{ position: "absolute", left: tk * PPS, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.03)" }} />
                  ))}
                  {/* Audio block */}
                  <div
                    onClick={() => setSelectedAudioId(t.id === selectedAudioId ? null : t.id)}
                    onMouseDown={(e) => handleAudioDrag(e, t.id, t.offset, dur, "move")}
                    style={{
                      position: "absolute", left: leftPx, top: ROW_PAD,
                      width: widthPx, height: AUDIO_H,
                      borderRadius: 4,
                      background: t.muted
                        ? "linear-gradient(90deg,#3a1a1a,#2a1010)"
                        : "linear-gradient(90deg,#1a4d2e,#0f3320)",
                      border: `1.5px solid ${t.id === selectedAudioId ? "var(--accent)" : t.muted ? "#5c2a2a" : "#2a7a4a"}`,
                      boxShadow: t.id === selectedAudioId ? "0 0 0 2px var(--accent)" : "none",
                      display: "flex", alignItems: "center",
                      paddingLeft: 6, cursor: "grab", userSelect: "none", overflow: "hidden",
                      opacity: t.muted ? 0.5 : 1,
                    }}>
                    <span style={{ fontSize: 9, color: t.muted ? "#f87171" : "#6ee7b7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: widthPx - 44, flexShrink: 1 }}>
                      🎵 {t.name}
                    </span>
                    <span style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", marginLeft: 4, flexShrink: 0 }}>{dur.toFixed(0)}s</span>
                    <button onClick={(ev) => { ev.stopPropagation(); removeTrack(t.id); }}
                      style={{ position: "absolute", top: 2, right: 2, width: 14, height: 14, borderRadius: "50%", background: "rgba(200,50,50,0.8)", border: "none", color: "#fff", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    {/* Resize right edge */}
                    <div onMouseDown={(e) => { e.stopPropagation(); handleAudioDrag(e, t.id, t.offset, dur, "resize"); }}
                      style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "ew-resize", background: "rgba(110,231,183,0.35)", borderRadius: "0 3px 3px 0" }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function Timeline() {
  const { mode, setMode } = useTimelineStore();
  const [zoom, setZoom] = useState<ZoomLevel>(0.5);
  const goToExport = useGoToExport();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <button
          className={`btn ${mode === "storyboard" ? "btn-primary" : "btn-secondary"}`}
          style={{ padding: "3px 10px", fontSize: 12 }}
          onClick={() => setMode("storyboard")}
        >
          Storyboard
        </button>
        <button
          className={`btn ${mode === "multitrack" ? "btn-primary" : "btn-secondary"}`}
          style={{ padding: "3px 10px", fontSize: 12 }}
          onClick={() => setMode("multitrack")}
        >
          Multi-track
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {/* Export shortcut */}
          <button
            className="btn btn-primary"
            style={{ padding: "3px 14px", fontSize: 12 }}
            onClick={goToExport}
          >
            🚀 Export
          </button>
          <div style={{ width: 1, height: 16, background: "var(--border)" }} />
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Zoom</span>
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              style={{
                padding: "2px 7px",
                fontSize: 11,
                borderRadius: 3,
                border: `1px solid ${zoom === z ? "var(--accent)" : "var(--border)"}`,
                background: zoom === z ? "rgba(233,69,96,0.12)" : "transparent",
                color: zoom === z ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {z}×
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {mode === "storyboard" ? (
          <Storyboard zoom={zoom} />
        ) : (
          <MultiTrack zoom={zoom} />
        )}
      </div>
    </div>
  );
}
