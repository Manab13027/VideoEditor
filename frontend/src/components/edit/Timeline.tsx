import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { Storyboard } from "./Storyboard";
import { AudioTrack } from "./AudioTrack";
import { getMediaThumbnailUrl, mergeClips, uploadMedia, startExport } from "../../api/client";
import { useState, useRef, useEffect } from "react";

const TRACK_HEIGHT = 56;

function clipDuration(clip: { type: string; trim_start: number; trim_end: number | null; duration: number | null }, mediaDuration: number | null): number {
  if (clip.type === "image") return clip.duration ?? 5;
  const end = clip.trim_end ?? mediaDuration ?? 10;
  return Math.max(0.5, end - clip.trim_start);
}

export function Timeline() {
  const { mode, setMode, clips, selectedClipId, selectClip, removeClip, selectedClipIds, toggleClipSelection, clearClipSelection, insertClipAt } = useTimelineStore();
  const { mediaFiles, addMediaFile } = useProjectStore();

  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const totalDuration = sorted.reduce((sum, c) => {
    const media = mediaFiles.find((f) => f.id === c.media_id);
    return sum + clipDuration(c, media?.duration_seconds ?? null);
  }, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <button className={`btn ${mode === "storyboard" ? "btn-primary" : "btn-secondary"}`} style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setMode("storyboard")}>
          Storyboard
        </button>
        <button className={`btn ${mode === "multitrack" ? "btn-primary" : "btn-secondary"}`} style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setMode("multitrack")}>
          Multi-track
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {mode === "storyboard" ? (
          <Storyboard />
        ) : (
          <MultiTrack
            sorted={sorted}
            mediaFiles={mediaFiles}
            selectedClipId={selectedClipId}
            selectedClipIds={selectedClipIds}
            selectClip={selectClip}
            toggleClipSelection={toggleClipSelection}
            clearClipSelection={clearClipSelection}
            removeClip={removeClip}
            insertClipAt={insertClipAt}
            addMediaFile={addMediaFile}
            totalDuration={totalDuration}
          />
        )}
      </div>
    </div>
  );
}

const ZOOM_LEVELS = [0.5, 1, 2, 4] as const;

function MultiTrack({
  sorted, mediaFiles, selectedClipId, selectedClipIds, selectClip, toggleClipSelection,
  clearClipSelection, removeClip, insertClipAt, addMediaFile, totalDuration,
}: {
  sorted: ReturnType<typeof useTimelineStore.getState>["clips"];
  mediaFiles: ReturnType<typeof useProjectStore.getState>["mediaFiles"];
  selectedClipId: string | null;
  selectedClipIds: string[];
  selectClip: (id: string | null) => void;
  toggleClipSelection: (id: string, add: boolean) => void;
  clearClipSelection: () => void;
  removeClip: (id: string) => void;
  insertClipAt: (clip: Omit<ReturnType<typeof useTimelineStore.getState>["clips"][number], "order">, atOrder: number) => void;
  addMediaFile: (file: ReturnType<typeof useProjectStore.getState>["mediaFiles"][number]) => void;
  totalDuration: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [merging, setMerging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dropHint, setDropHint] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const basePxPerSec = Math.max(20, containerW / Math.max(totalDuration, 1));
  const PX_PER_SEC = basePxPerSec * zoom;
  const totalW = Math.max(PX_PER_SEC * totalDuration, containerW);

  const videoClips = sorted.filter((c) => c.type === "video");
  const imageClips = sorted.filter((c) => c.type === "image");

  const handleDropFiles = async (files: FileList | null, atOrder: number) => {
    if (!files || files.length === 0) return;
    const allowed = Array.from(files).filter((f) =>
      f.type.startsWith("video/") || f.type.startsWith("image/") ||
      /\.(mp4|mov|avi|mkv|webm|jpg|jpeg|png|gif|webp)$/i.test(f.name)
    );
    if (allowed.length === 0) return;
    setDropHint(`Uploading ${allowed.length} file(s)…`);
    try {
      for (const file of allowed) {
        const res = await uploadMedia(file);
        const media = res.data;
        addMediaFile(media);
        const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
        insertClipAt(
          {
            id: `clip_${media.id}_${Date.now()}`,
            media_id: media.id,
            type: isImage ? "image" : "video",
            trim_start: 0,
            trim_end: null,
            crop: null,
            speed: 1,
            duration: media.duration_seconds,
          },
          atOrder
        );
      }
    } catch (err) {
      console.error("Drop upload failed:", err);
    } finally {
      setDropHint(null);
    }
  };

  const handleExportTimeline = async () => {
    if (sorted.length === 0 || exporting) return;
    setExporting(true);
    try {
      const { saveTimeline, project } = useProjectStore.getState();
      const { mode: tMode, clips: tClips, overlays: tOverlays } = useTimelineStore.getState();
      await saveTimeline({ mode: tMode, clips: tClips, overlays: tOverlays });
      if (!project) return;
      await startExport({
        project_id: String(project.id),
        preset: "youtube",
        container: "mp4",
        video_codec: "libx264",
        audio_codec: "aac",
        width: 1920,
        height: 1080,
        bitrate: 8,
        fps: 30,
        upload_to_drive: false,
      });
      alert("Export started! Check the Export tab for progress.");
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Check console for details.");
    } finally {
      setExporting(false);
    }
  };

  const handleMerge = async () => {
    if (selectedClipIds.length < 2 || merging) return;
    setMerging(true);
    try {
      const orderedClips = [...sorted]
        .filter((c) => selectedClipIds.includes(c.id))
        .sort((a, b) => a.order - b.order);

      const specs = orderedClips.map((c) => ({
        media_id: c.media_id,
        trim_start: c.trim_start,
        trim_end: c.trim_end,
      }));

      const res = await mergeClips(specs);
      const mergedMedia = res.data;
      addMediaFile(mergedMedia);

      const firstOrder = Math.min(...orderedClips.map((c) => c.order));
      orderedClips.forEach((c) => removeClip(c.id));

      useTimelineStore.getState().addClip({
        id: `merged_${Date.now()}`,
        media_id: mergedMedia.id,
        type: "video",
        trim_start: 0,
        trim_end: null,
        crop: null,
        speed: 1,
        duration: mergedMedia.duration_seconds,
        order: firstOrder,
      });
      clearClipSelection();
    } catch (err) {
      console.error("Merge failed:", err);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Zoom toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg-secondary)" }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Zoom:</span>
        {ZOOM_LEVELS.map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            style={{
              padding: "2px 8px", fontSize: 11, borderRadius: 3,
              border: `1px solid ${zoom === z ? "var(--accent)" : "var(--border)"}`,
              background: zoom === z ? "rgba(233,69,96,0.12)" : "var(--bg-tertiary)",
              color: zoom === z ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {z === 1 ? "Fit" : `${z}×`}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {dropHint && (
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{dropHint}</span>
          )}
          {selectedClipIds.length >= 2 && (
            <button
              onClick={handleMerge}
              disabled={merging}
              style={{
                padding: "2px 12px", fontSize: 11, borderRadius: 3,
                border: "1px solid var(--accent)", background: "rgba(233,69,96,0.15)",
                color: "var(--accent)", cursor: merging ? "not-allowed" : "pointer", fontWeight: 600,
              }}
            >
              {merging ? "Merging…" : `Merge ${selectedClipIds.length} Clips`}
            </button>
          )}
          <button
            onClick={handleExportTimeline}
            disabled={exporting || sorted.length === 0}
            style={{
              padding: "2px 12px", fontSize: 11, borderRadius: 3,
              border: "1px solid #22c55e", background: "rgba(34,197,94,0.12)",
              color: "#22c55e", cursor: (exporting || sorted.length === 0) ? "not-allowed" : "pointer", fontWeight: 600,
            }}
          >
            {exporting ? "Exporting…" : "Export Video"}
          </button>
        </div>
      </div>

      {/* Scrollable track area */}
      <div ref={containerRef} style={{ flex: 1, overflowX: "auto", overflowY: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Time ruler */}
        <div style={{ display: "flex", height: 22, flexShrink: 0, position: "relative", minWidth: totalW + 100, paddingLeft: 100, borderBottom: "1px solid var(--border)", background: "var(--bg-primary)" }}>
          {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
            <div key={i} style={{ position: "absolute", left: 100 + i * PX_PER_SEC, top: 0, height: "100%", display: "flex", alignItems: "flex-end", paddingBottom: 3 }}>
              <div style={{ width: 1, height: 8, background: "var(--border)", marginRight: 3 }} />
              <span style={{ fontSize: 9, color: "var(--text-secondary)" }}>{i}s</span>
            </div>
          ))}
        </div>

        {/* Video track */}
        <TrackRow label="Video" icon="🎥" totalW={totalW} clips={videoClips} mediaFiles={mediaFiles} selectedClipId={selectedClipId} selectedClipIds={selectedClipIds} selectClip={selectClip} toggleClipSelection={toggleClipSelection} removeClip={removeClip} PX_PER_SEC={PX_PER_SEC} onDropFiles={handleDropFiles} />

        {/* Image overlay track */}
        <TrackRow label="Overlay" icon="🖼" totalW={totalW} clips={imageClips} mediaFiles={mediaFiles} selectedClipId={selectedClipId} selectedClipIds={selectedClipIds} selectClip={selectClip} toggleClipSelection={toggleClipSelection} removeClip={removeClip} PX_PER_SEC={PX_PER_SEC} onDropFiles={handleDropFiles} />

        {/* Audio track */}
        <AudioTrack totalW={totalW} />
      </div>
    </div>
  );
}

function TrackRow({
  label, icon, totalW, clips, mediaFiles, selectedClipId, selectedClipIds,
  selectClip, toggleClipSelection, removeClip, PX_PER_SEC, onDropFiles,
}: {
  label: string; icon: string; totalW: number; PX_PER_SEC: number;
  clips: ReturnType<typeof useTimelineStore.getState>["clips"];
  mediaFiles: ReturnType<typeof useProjectStore.getState>["mediaFiles"];
  selectedClipId: string | null;
  selectedClipIds: string[];
  selectClip: (id: string | null) => void;
  toggleClipSelection: (id: string, add: boolean) => void;
  removeClip: (id: string) => void;
  onDropFiles: (files: FileList | null, atOrder: number) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const getInsertOrder = (e: React.DragEvent<HTMLDivElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xInRegion = e.clientX - rect.left;
    const sorted = [...clips].sort((a, b) => a.order - b.order);
    let accumulated = 0;
    for (const clip of sorted) {
      const media = mediaFiles.find((f) => f.id === clip.media_id);
      const dur = clipDuration(clip, media?.duration_seconds ?? null);
      const midX = (accumulated + dur / 2) * PX_PER_SEC;
      if (xInRegion < midX) return clip.order;
      accumulated += dur;
    }
    return clips.length;
  };

  return (
    <div style={{ display: "flex", height: TRACK_HEIGHT, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
      {/* Track label */}
      <div style={{ width: 100, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", borderRight: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</span>
      </div>

      {/* Clip region */}
      <div
        style={{ position: "relative", flex: 1, minWidth: totalW, overflowX: "visible", outline: dragOver ? "2px dashed var(--accent)" : undefined }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onDropFiles(e.dataTransfer.files, getInsertOrder(e)); }}
      >
        {clips.map((clip) => {
          const media = mediaFiles.find((f) => f.id === clip.media_id);
          const dur   = clipDuration(clip, media?.duration_seconds ?? null);
          // Position: sum of durations before this clip
          const clips_before = clips.filter((c) => c.order < clip.order);
          const offsetSec = clips_before.reduce((s, c) => {
            const m = mediaFiles.find((f) => f.id === c.media_id);
            return s + clipDuration(c, m?.duration_seconds ?? null);
          }, 0);
          const left  = offsetSec * PX_PER_SEC;
          const width = Math.max(dur * PX_PER_SEC, 30);
          const isSelected = clip.id === selectedClipId || selectedClipIds.includes(clip.id);
          const thumb = media ? getMediaThumbnailUrl(media.id) : null;

          return (
            <div
              key={clip.id}
              title={`${media?.filename ?? clip.id} · ${dur.toFixed(1)}s — Double-click to remove`}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  toggleClipSelection(clip.id, true);
                } else {
                  selectClip(clip.id);
                  toggleClipSelection(clip.id, false);
                }
              }}
              onDoubleClick={() => removeClip(clip.id)}
              style={{
                position: "absolute",
                left,
                top: 4,
                width,
                height: TRACK_HEIGHT - 8,
                borderRadius: 4,
                border: `2px solid ${isSelected ? "var(--accent)" : "rgba(255,255,255,0.15)"}`,
                background: isSelected ? "rgba(233,69,96,0.15)" : "var(--bg-tertiary)",
                cursor: "pointer",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "0 6px",
                userSelect: "none",
                boxSizing: "border-box",
                transition: "border-color 0.1s",
              }}
            >
              {thumb && (
                <img src={thumb} alt="" style={{ height: "100%", width: 32, objectFit: "cover", borderRadius: 2, flexShrink: 0, opacity: 0.8 }} />
              )}
              <span style={{ fontSize: 10, color: isSelected ? "var(--accent)" : "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {media?.filename ?? clip.id}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
