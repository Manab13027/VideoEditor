import { useBatchStore } from "../../stores/batchStore";
import { startBatchJob } from "../../api/client";
import type { BatchOperation } from "../../types";

interface OperationDef {
  type: string;
  icon: string;
  label: string;
  description: string;
}

const OPERATION_DEFS: OperationDef[] = [
  { type: "convert", icon: "🔄", label: "Convert", description: "Change file format" },
  { type: "crop_resize", icon: "✂️", label: "Crop / Resize", description: "Adjust dimensions" },
  { type: "watermark", icon: "💧", label: "Watermark", description: "Overlay text or image" },
  { type: "trim", icon: "✂", label: "Trim", description: "Cut start / end" },
  { type: "thumbnails", icon: "📸", label: "Thumbnails", description: "Extract frame previews" },
  { type: "compress", icon: "📦", label: "Compress", description: "Reduce file size" },
];

export function OperationConfig() {
  const { operations, selectedFileIds, addOperation, removeOperation, setActiveJob } = useBatchStore();

  const activeTypes = new Set(operations.map((o) => o.type));

  const toggleOperation = (def: OperationDef) => {
    if (activeTypes.has(def.type)) {
      const idx = operations.findIndex((o) => o.type === def.type);
      if (idx >= 0) removeOperation(idx);
    } else {
      const newOp: BatchOperation = { type: def.type };
      addOperation(newOp);
    }
  };

  const handleProcess = async () => {
    if (selectedFileIds.size === 0 || operations.length === 0) return;
    try {
      const res = await startBatchJob(Array.from(selectedFileIds), operations);
      setActiveJob(res.data);
    } catch (err) {
      console.error("Failed to start batch job:", err);
    }
  };

  const canProcess = selectedFileIds.size > 0 && operations.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "10px 12px 8px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <span className="section-label">Operations</span>
      </div>

      {/* Operation grid */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          alignContent: "start",
        }}
      >
        {OPERATION_DEFS.map((def) => {
          const active = activeTypes.has(def.type);
          return (
            <div
              key={def.type}
              onClick={() => toggleOperation(def)}
              style={{
                padding: "10px 12px",
                borderRadius: 6,
                background: active ? "rgba(233,69,96,0.08)" : "var(--bg-tertiary)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={active}
                  readOnly
                  style={{ accentColor: "var(--accent)", flexShrink: 0 }}
                />
                <span style={{ fontSize: 16 }}>{def.icon}</span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: active ? "var(--accent)" : "var(--text-primary)",
                  }}
                >
                  {def.label}
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", paddingLeft: 22 }}>
                {def.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Process button */}
      <div
        style={{
          padding: 12,
          flexShrink: 0,
          borderTop: "1px solid var(--border)",
        }}
      >
        <button
          className="btn btn-primary"
          disabled={!canProcess}
          onClick={handleProcess}
          style={{
            width: "100%",
            justifyContent: "center",
            opacity: canProcess ? 1 : 0.4,
            cursor: canProcess ? "pointer" : "not-allowed",
          }}
        >
          🚀 Process {selectedFileIds.size > 0 ? selectedFileIds.size : ""} File{selectedFileIds.size !== 1 ? "s" : ""}
        </button>
        {!canProcess && (
          <p style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center", marginTop: 6 }}>
            {selectedFileIds.size === 0
              ? "Select files to process"
              : "Choose at least one operation"}
          </p>
        )}
      </div>
    </div>
  );
}
