const sections = [
  {
    title: "Getting Started",
    items: [
      { q: "Import media", a: "Drag & drop files into the Media Browser (left panel) or click 'Import'." },
      { q: "Add to timeline", a: "Drag a clip from the Media Browser into the bottom Timeline strip, or double-click it." },
      { q: "Select a clip", a: "Click any clip in the Timeline to select it. Properties appear in the right panel." },
    ],
  },
  {
    title: "Color Tools",
    items: [
      { q: "Brightness / Contrast / Saturation / Hue", a: "In the Properties panel → Color section. Sliders update the preview instantly." },
      { q: "Filter Presets", a: "Quick one-click looks: B&W, Sepia, Vintage, Vivid, Cool, Warm, Teal & Orange, Matte, Film Noir, Golden, Cyberpunk, Faded." },
      { q: "RGB Curves", a: "Advanced per-channel tonal control. In Properties → Curves. Click to add control points, drag to reshape, double-click to remove. Switch channels: RGB (master), R, G, B." },
      { q: "Color Wheels (Lift / Gamma / Gain)", a: "Three-way color corrector in Properties → Color Wheels. Drag inside each circle: left = cool, right = warm, up = green, down = magenta. Affects Shadows, Midtones, and Highlights separately." },
    ],
  },
  {
    title: "Effects & Styling",
    items: [
      { q: "Motion Blur", a: "Properties → Effects → Motion Blur slider (0–100%). Simulates fast-motion trailing. Applied at export." },
      { q: "Glow", a: "Properties → Effects → Glow slider. Adds a soft light bloom around bright areas." },
      { q: "Shake", a: "Properties → Effects → Shake slider. Adds camera shake jitter. Preview shows animation; exported via displacement." },
      { q: "Rotate", a: "Properties → Transform. Rotate 90°, 180°, or 270°. Applied live in preview." },
      { q: "Reverse Video", a: "Properties → Transform → Reverse Video. Plays clip backwards." },
    ],
  },
  {
    title: "Transitions",
    items: [
      { q: "Adding a transition", a: "Select a clip → Properties → Transition. Choose type (Fade, Crossfade, Wipe Left/Right, Zoom In, Glitch) and set duration in seconds." },
      { q: "How transitions work", a: "The transition plays at the beginning of the selected clip, blending from the previous clip. FFmpeg xfade is applied on export." },
    ],
  },
  {
    title: "Trim & Speed",
    items: [
      { q: "Trim start / end", a: "Properties → Trim. Enter start and end times in seconds." },
      { q: "Change speed", a: "Properties → Speed. Choose from 0.25× to 4×. Preview updates immediately." },
      { q: "Split clip", a: "Play the video in the preview, pause at the split point, then click ✂ Split in the Storyboard toolbar." },
    ],
  },
  {
    title: "Crop",
    items: [
      { q: "Visual crop", a: "Select clip → Properties → Crop → ✂ Edit. Drag handles in the preview player to set the crop region." },
      { q: "Apply Crop", a: "Click 'Apply Crop' to bake the crop permanently into the media file. The preview refreshes automatically." },
      { q: "Reset crop", a: "Click Reset in the Crop section to return to full frame." },
    ],
  },
  {
    title: "Fade In / Out",
    items: [
      { q: "Fade in / out", a: "Properties → Fade. Enter duration in seconds (e.g. 0.5). Applied at export via FFmpeg." },
    ],
  },
  {
    title: "Timeline Modes",
    items: [
      { q: "Storyboard view", a: "Cards laid out horizontally. Drag to reorder. Click ✂ Split, or double-click to remove." },
      { q: "Multi-track view", a: "Video, Overlay (images), and Audio tracks. Clips shown proportionally to their duration." },
      { q: "Resize panels", a: "Drag the thin grey handles between panels to resize any panel." },
    ],
  },
  {
    title: "Batch Processing",
    items: [
      { q: "Select files", a: "Go to the Batch tab. Click files in the file queue to toggle selection." },
      { q: "Choose operations", a: "Tick one or more operations: Convert, Crop/Resize, Watermark, Trim, Thumbnails, Compress." },
      { q: "Process", a: "Click 🚀 Process. Progress shows in the right panel." },
    ],
  },
  {
    title: "Export",
    items: [
      { q: "Export settings", a: "Go to Export tab. Choose container (MP4, MOV, WebM), codec, resolution, bitrate, and FPS." },
      { q: "Social presets", a: "One-click presets for YouTube, Instagram Reel, TikTok, Twitter, Instagram Post, WhatsApp." },
      { q: "Quality tiers", a: "SD (480p), HD (720p), Full HD (1080p), 4K (2160p)." },
      { q: "Google Drive upload", a: "Connect Drive in Export settings to automatically upload the finished file." },
    ],
  },
];

export function HelpPanel() {
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 24, background: "var(--bg-primary)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)", marginBottom: 6 }}>ClipForge — Help</h1>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 24 }}>
        Quick reference for all features. Select a clip first to enable editing in the Properties panel.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {sections.map((sec) => (
          <div key={sec.title}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {sec.title}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sec.items.map((item) => (
                <div key={item.q} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", paddingTop: 1 }}>{item.q}</span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{item.a}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, padding: 12, borderRadius: 6, background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text-primary)" }}>Keyboard shortcuts:</strong> Space = play/pause · Double-click clip = remove · Drag clip = reorder · Drag panel edge = resize
        </p>
      </div>
    </div>
  );
}
