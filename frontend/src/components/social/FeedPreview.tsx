import { useState } from "react";
import { useSocialStore } from "../../stores/socialStore";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { getMediaProxyUrl } from "../../api/client";
import type { SocialPlatform } from "../../types";

const TABS: { id: SocialPlatform; label: string }[] = [
  { id: "tiktok",         label: "TikTok"   },
  { id: "instagram_reel", label: "IG Reel"  },
  { id: "instagram_post", label: "IG Post"  },
  { id: "youtube",        label: "YouTube"  },
];

function VideoOrPlaceholder({ src, style }: { src: string | null; style: React.CSSProperties }) {
  if (!src) {
    return (
      <div style={{ ...style, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 10 }}>
        Select a clip
      </div>
    );
  }
  return <video src={src} style={style} controls muted loop playsInline />;
}

function TikTokMock({ src, title, caption }: { src: string | null; title: string; caption: string }) {
  return (
    <div style={{ width: 190, background: "#000", borderRadius: 14, overflow: "hidden", border: "1px solid #333", flexShrink: 0 }}>
      <div style={{ position: "relative", aspectRatio: "9/16" }}>
        <VideoOrPlaceholder src={src} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 8px 8px", background: "linear-gradient(transparent, rgba(0,0,0,0.8))" }}>
          <p style={{ color: "#fff", fontSize: 9, fontWeight: 700, margin: "0 0 2px" }}>@username</p>
          <p style={{ color: "#eee", fontSize: 8, margin: "0 0 2px" }}>{title || "Video title"}</p>
          <p style={{ color: "#aaa", fontSize: 7, margin: 0 }}>{(caption || "Caption").slice(0, 40)}</p>
        </div>
        <div style={{ position: "absolute", right: 6, bottom: 50, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          {["\u2665", "\ud83d\udcac", "\u2197"].map((icon) => <span key={icon} style={{ color: "#fff", fontSize: 16 }}>{icon}</span>)}
        </div>
      </div>
    </div>
  );
}

function IGReelMock({ src, caption }: { src: string | null; caption: string }) {
  return (
    <div style={{ width: 190, background: "#000", borderRadius: 14, overflow: "hidden", border: "1px solid #333", flexShrink: 0 }}>
      <div style={{ position: "relative", aspectRatio: "9/16" }}>
        <VideoOrPlaceholder src={src} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "6px 8px", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#444", border: "1px solid #fff", flexShrink: 0 }} />
          <span style={{ color: "#fff", fontSize: 9, fontWeight: 600 }}>username</span>
          <span style={{ color: "#fff", fontSize: 9, marginLeft: "auto" }}>...</span>
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 8px 8px", background: "linear-gradient(transparent, rgba(0,0,0,0.8))" }}>
          <p style={{ color: "#eee", fontSize: 8, margin: "0 0 2px", fontWeight: 600 }}>username</p>
          <p style={{ color: "#aaa", fontSize: 7, margin: 0 }}>{(caption || "Caption").slice(0, 50)}</p>
        </div>
        <div style={{ position: "absolute", right: 6, bottom: 50, display: "flex", flexDirection: "column", gap: 10 }}>
          {["\u2665", "\ud83d\udcac", "\u27a4"].map((icon) => <span key={icon} style={{ color: "#fff", fontSize: 16 }}>{icon}</span>)}
        </div>
      </div>
    </div>
  );
}

function IGPostMock({ src, caption }: { src: string | null; caption: string }) {
  return (
    <div style={{ width: 210, background: "#000", borderRadius: 8, overflow: "hidden", border: "1px solid #333", flexShrink: 0 }}>
      <div style={{ padding: "6px 8px", display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#444", flexShrink: 0 }} />
        <span style={{ color: "#fff", fontSize: 9, fontWeight: 600 }}>username</span>
        <span style={{ color: "#fff", fontSize: 9, marginLeft: "auto" }}>...</span>
      </div>
      <div style={{ aspectRatio: "1/1" }}>
        <VideoOrPlaceholder src={src} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <div style={{ padding: "8px" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 5 }}>
          {["\u2665", "\ud83d\udcac", "\u27a4"].map((icon) => <span key={icon} style={{ color: "#fff", fontSize: 14 }}>{icon}</span>)}
        </div>
        <p style={{ color: "#fff", fontSize: 8, margin: 0, lineHeight: 1.5 }}>
          <strong>username</strong> {(caption || "Caption").slice(0, 70)}
        </p>
      </div>
    </div>
  );
}

function YouTubeMock({ src, title }: { src: string | null; title: string }) {
  return (
    <div style={{ width: 240, background: "#0f0f0f", borderRadius: 8, overflow: "hidden", border: "1px solid #333", flexShrink: 0 }}>
      <div style={{ aspectRatio: "16/9", position: "relative" }}>
        <VideoOrPlaceholder src={src} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", bottom: 4, right: 4, background: "rgba(0,0,0,0.85)", color: "#fff", fontSize: 8, padding: "2px 4px", borderRadius: 2 }}>
          3:42
        </div>
      </div>
      <div style={{ padding: "8px", display: "flex", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#444", flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ color: "#fff", fontSize: 10, fontWeight: 600, margin: "0 0 3px", lineHeight: 1.3 }}>{(title || "Video title").slice(0, 55)}</p>
          <p style={{ color: "#aaa", fontSize: 8, margin: 0 }}>Channel · 1.2K views · 2h ago</p>
        </div>
      </div>
    </div>
  );
}

export function FeedPreview() {
  const { metadata } = useSocialStore();
  const { selectedClipId, clips } = useTimelineStore();
  const { mediaFiles } = useProjectStore();
  const [active, setActive] = useState<SocialPlatform>("tiktok");

  const clip  = clips.find((c) => c.id === selectedClipId) ?? null;
  const media = clip ? mediaFiles.find((f) => f.id === clip.media_id) ?? null : null;
  const src   = media && clip?.type === "video" ? getMediaProxyUrl(media.id) : null;

  const title   = metadata.title || "";
  const caption = metadata.description || "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      {/* Platform switcher */}
      <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)", flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            style={{
              flex: 1, padding: "7px 4px", fontSize: 10, fontWeight: active === tab.id ? 700 : 400,
              background: active === tab.id ? "var(--accent)" : "var(--bg-secondary)",
              border: "none", color: active === tab.id ? "#fff" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mock */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }}>
        {active === "tiktok"         && <TikTokMock  src={src} title={title} caption={caption} />}
        {active === "instagram_reel" && <IGReelMock  src={src} caption={caption} />}
        {active === "instagram_post" && <IGPostMock  src={src} caption={caption} />}
        {active === "youtube"        && <YouTubeMock src={src} title={title} />}
      </div>
    </div>
  );
}
