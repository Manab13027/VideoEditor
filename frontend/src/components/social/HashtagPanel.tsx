import { useState } from "react";
import { useSocialStore } from "../../stores/socialStore";
import { socialHashtags } from "../../api/client";
import type { HashtagResult } from "../../types";

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: "#60a5fa",
  instagram_reel: "#f472b6",
  instagram_post: "#f472b6",
  youtube: "#f87171",
};

export function HashtagPanel() {
  const { metadata, hashtags, setHashtags } = useSocialStore();
  const [keyword, setKeyword] = useState(metadata.title);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!keyword.trim() || metadata.platforms.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await socialHashtags({
        title: keyword,
        description: metadata.description,
        platforms: metadata.platforms,
        api_key: apiKey || undefined,
      });
      setHashtags((res.data as { results: HashtagResult[] }).results);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const copy = (tags: string[]) => {
    navigator.clipboard.writeText(tags.map((t) => `#${t}`).join(" "));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Keyword or topic…"
          style={{ flex: 1, padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12 }}
        />
        <button
          onClick={generate}
          disabled={loading || !keyword.trim() || metadata.platforms.length === 0}
          style={{
            padding: "5px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            background: loading || !keyword.trim() || metadata.platforms.length === 0 ? "var(--bg-tertiary)" : "var(--accent)",
            border: "none", color: loading ? "var(--text-secondary)" : "#fff",
            cursor: loading || !keyword.trim() ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "…" : "✨ Generate"}
        </button>
      </div>

      <div>
        <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 3px" }}>
          Claude API key <span style={{ color: "#555" }}>(optional — uses local database if empty)</span>
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-…"
          style={{ width: "100%", padding: "4px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 11, boxSizing: "border-box" }}
        />
      </div>

      {metadata.platforms.length === 0 && (
        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>Select platforms in Metadata first.</p>
      )}
      {error && <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{error}</p>}

      {hashtags.map(({ platform, tags }) => (
        <div key={platform}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: PLATFORM_COLORS[platform] ?? "var(--accent)" }}>
              {platform.replace(/_/g, " ")} ({tags.length})
            </span>
            <button
              onClick={() => copy(tags)}
              style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              📋 Copy
            </button>
          </div>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7 }}>
            {tags.slice(0, 15).map((t) => `#${t}`).join(" ")}
            {tags.length > 15 && ` … +${tags.length - 15} more`}
          </p>
        </div>
      ))}
    </div>
  );
}
