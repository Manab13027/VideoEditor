const RATIOS = ["16:9", "9:16", "1:1", "4:3", "Free"] as const;
export type AspectRatio = typeof RATIOS[number];

interface AspectRatioSelectorProps {
  value: AspectRatio;
  onChange: (ratio: AspectRatio) => void;
}

export function AspectRatioSelector({ value, onChange }: AspectRatioSelectorProps) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {RATIOS.map((r) => (
        <button
          key={r}
          className={`btn ${value === r ? "btn-primary" : "btn-secondary"}`}
          style={{ padding: "4px 10px", fontSize: 12 }}
          onClick={() => onChange(r)}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
