import { MetadataPanel }      from "./MetadataPanel";
import { ValidationWarnings } from "./ValidationWarnings";
import { HashtagPanel }       from "./HashtagPanel";
import { ThumbnailPicker }    from "./ThumbnailPicker";
import { MultiExportPanel }   from "./MultiExportPanel";
import { FeedPreview }        from "./FeedPreview";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</p>
      </div>
      <div style={{ padding: "10px 12px" }}>{children}</div>
    </div>
  );
}

export function SocialPanel() {
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg-primary)" }}>
      {/* Left column — controls */}
      <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--border)", overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <Section title="Metadata">
          <MetadataPanel />
        </Section>
        <Section title="Hashtags">
          <HashtagPanel />
        </Section>
        <Section title="Thumbnail">
          <ThumbnailPicker />
        </Section>
        <Section title="Platform Check">
          <ValidationWarnings />
        </Section>
        <Section title="Export All Platforms">
          <MultiExportPanel />
        </Section>
      </div>

      {/* Right column — feed preview */}
      <div style={{ flex: 1, padding: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", margin: "0 0 12px" }}>Feed Preview</p>
        <FeedPreview />
      </div>
    </div>
  );
}
