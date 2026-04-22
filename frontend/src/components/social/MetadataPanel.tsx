import { useSocialStore } from "../../stores/socialStore";
import type { SocialPlatform } from "../../types";

const PLATFORM_CHIPS: { id: SocialPlatform; label: string; color: string }[] = [
  { id: "tiktok",         label: "TikTok",   color: "#fe2c55" },
  { id: "instagram_reel", label: "IG Reel",  color: "#e1306c" },
  { id: "instagram_post", label: "IG Post",  color: "#e1306c" },
  { id: "youtube",        label: "YouTube",  color: "#ff0000" },
];

export function MetadataPanel() {
  const { metadata, setMetadata } = useSocialStore();

  const togglePlatform = (id: SocialPlatform) => {
    const platforms = metadata.platforms.includes(id)
      ? metadata.platforms.filter((p) => p !== id)
      : [...metadata.platforms, id];
    setMetadata({ platforms });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 3px" }}>Title</p>
        <input
          value={metadata.title}
          onChange={(e) => setMetadata({ title: e.target.value })}
          placeholder="Video title…"
          style={{ width: "100%", padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, boxSizing: "border-box" }}
        />
      </div>
      <div>
        <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 3px" }}>Caption / Description</p>
        <textarea
          value={metadata.description}
          onChange={(e) => setMetadata({ description: e.target.value })}
          placeholder="Caption for Instagram, description for YouTube…"
          rows={3}
          style={{ width: "100%", padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
        />
      </div>
      <div>
        <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 5px" }}>Platforms</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PLATFORM_CHIPS.map((p) => {
            const active = metadata.platforms.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => togglePlatform(p.id)}
                style={{
                  padding: "3px 10px", borderRadius: 12, fontSize: 11, cursor: "pointer",
                  border: `1px solid ${active ? p.color : "var(--border)"}`,
                  background: active ? `${p.color}22` : "transparent",
                  color: active ? p.color : "var(--text-secondary)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
