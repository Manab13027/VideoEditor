import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { VideoPlayer } from "../shared/VideoPlayer";
import { getMediaProxyUrl } from "../../api/client";

export function PreviewPlayer() {
  const { selectedClipId, clips } = useTimelineStore();
  const { mediaFiles } = useProjectStore();

  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  const media = clip ? mediaFiles.find((f) => f.id === clip.media_id) ?? null : null;

  if (!clip || !media) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          gap: 12,
          color: "var(--text-secondary)",
        }}
      >
        <span style={{ fontSize: 48 }}>▶</span>
        <p style={{ fontSize: 13 }}>Select a clip to preview</p>
      </div>
    );
  }

  const proxyUrl = getMediaProxyUrl(media.id);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        padding: 16,
        background: "#000",
      }}
    >
      {media.media_type === "image" ? (
        <img
          src={proxyUrl}
          alt={media.filename}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            borderRadius: 4,
          }}
        />
      ) : (
        <div style={{ width: "100%", maxHeight: "100%" }}>
          <VideoPlayer src={proxyUrl} />
        </div>
      )}
    </div>
  );
}
