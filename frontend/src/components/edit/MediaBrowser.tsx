import { useState } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { useTimelineStore } from "../../stores/timelineStore";
import { useAudioStore } from "../../stores/audioStore";
import { FileDropZone } from "../shared/FileDropZone";
import { uploadMedia, audioImport } from "../../api/client";
import type { MediaFile, AudioTrack } from "../../types";

type FilterTab = "all" | "video" | "image" | "audio";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function mediaIcon(type: string) {
  if (type === "video") return "🎥";
  if (type === "audio") return "🎵";
  return "🖼";
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/");
}

function MediaItem({ file, onClick }: { file: MediaFile; onClick: (f: MediaFile) => void }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("media_id", String(file.id));
    e.dataTransfer.setData("media_type", file.media_type);
  };

  return (
    <div
      draggable
      onClick={() => onClick(file)}
      onDragStart={handleDragStart}
      title="Click to add · Drag to position in timeline"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: 4,
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border)",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 3,
          background: "var(--bg-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          flexShrink: 0,
        }}
      >
        {mediaIcon(file.media_type)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {file.filename}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
          {file.width && file.height ? `${file.width}×${file.height}` : ""}
          {file.duration_seconds != null ? ` · ${formatDuration(file.duration_seconds)}` : ""}
          {` · ${formatSize(file.file_size_bytes)}`}
        </p>
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--text-secondary)",
        marginTop: 10,
        marginBottom: 4,
        paddingLeft: 2,
      }}
    >
      {label}
    </p>
  );
}

export function MediaBrowser() {
  const { mediaFiles, addMediaFile } = useProjectStore();
  const { addClip } = useTimelineStore();
  const { addTrack } = useAudioStore();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [uploading, setUploading] = useState(false);

  const handleFileDrop = async (files: File[]) => {
    setUploading(true);
    try {
      for (const file of files) {
        if (isAudioFile(file)) {
          const res = await audioImport(file, "music");
          const d = res.data;
          // Construct a MediaFile-compatible record from the audio import response
          addMediaFile({
            id: d.media_id,
            filename: d.filename,
            media_type: "audio",
            format: file.name.split(".").pop() ?? "mp3",
            width: null,
            height: null,
            duration_seconds: d.duration,
            file_size_bytes: file.size,
            proxy_path: null,
            thumbnail_path: null,
          } as MediaFile);
        } else {
          const res = await uploadMedia(file);
          addMediaFile(res.data);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleItemClick = (file: MediaFile) => {
    if (file.media_type === "audio") {
      const track: AudioTrack = {
        id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: "music",
        mediaId: String(file.id),
        name: file.filename,
        volume: 1.0,
        offset: 0,
        muted: false,
        waveform: [],
      };
      addTrack(track);
    } else {
      addClip({
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        media_id: file.id,
        type: file.media_type,
        trim_start: 0,
        trim_end: file.duration_seconds ?? null,
        crop: null,
        speed: 1,
        duration: file.media_type === "image" ? 5 : null,
      });
    }
  };

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "video", label: "Video" },
    { key: "image", label: "Image" },
    { key: "audio", label: "Audio" },
  ];

  const videos = mediaFiles.filter((f) => f.media_type === "video");
  const images = mediaFiles.filter((f) => f.media_type === "image");
  const audios = mediaFiles.filter((f) => f.media_type === "audio");

  const filtered =
    filter === "all"
      ? mediaFiles
      : mediaFiles.filter((f) => f.media_type === filter);

  const counts: Record<FilterTab, number> = {
    all: mediaFiles.length,
    video: videos.length,
    image: images.length,
    audio: audios.length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: "8px 8px 0",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: "4px 4px 0 0",
              border: "1px solid",
              borderBottom: "none",
              cursor: "pointer",
              background: filter === tab.key ? "var(--bg-primary)" : "transparent",
              borderColor: filter === tab.key ? "var(--border)" : "transparent",
              color: filter === tab.key ? "var(--text-primary)" : "var(--text-secondary)",
              transition: "color 0.15s",
            }}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span
                style={{
                  marginLeft: 4,
                  fontSize: 10,
                  color: "var(--text-secondary)",
                }}
              >
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        {filter === "all" ? (
          <>
            {videos.length > 0 && (
              <>
                <SectionHeader label="Video" />
                {videos.map((f) => (
                  <MediaItem key={f.id} file={f} onClick={handleItemClick} />
                ))}
              </>
            )}
            {images.length > 0 && (
              <>
                <SectionHeader label="Images" />
                {images.map((f) => (
                  <MediaItem key={f.id} file={f} onClick={handleItemClick} />
                ))}
              </>
            )}
            {audios.length > 0 && (
              <>
                <SectionHeader label="Audio" />
                {audios.map((f) => (
                  <MediaItem key={f.id} file={f} onClick={handleItemClick} />
                ))}
              </>
            )}
            {mediaFiles.length === 0 && (
              <p style={{ color: "var(--text-secondary)", fontSize: 12, textAlign: "center", marginTop: 16 }}>
                No files yet — drop video, image, or audio files below
              </p>
            )}
          </>
        ) : (
          <>
            {filtered.length === 0 && (
              <p style={{ color: "var(--text-secondary)", fontSize: 12, textAlign: "center", marginTop: 16 }}>
                No {filter} files yet
              </p>
            )}
            {filtered.map((file) => (
              <MediaItem key={file.id} file={file} onClick={handleItemClick} />
            ))}
          </>
        )}
      </div>

      {/* Drop zone */}
      <div style={{ padding: 8, flexShrink: 0, borderTop: "1px solid var(--border)" }}>
        {uploading && (
          <p style={{ fontSize: 11, color: "var(--accent)", marginBottom: 6, textAlign: "center" }}>
            Uploading…
          </p>
        )}
        <FileDropZone onFilesDropped={handleFileDrop} compact label="Drop or click — video, image, or audio" />
      </div>
    </div>
  );
}
