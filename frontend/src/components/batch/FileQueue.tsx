import { useRef } from "react";
import { useBatchStore } from "../../stores/batchStore";
import { FileDropZone } from "../shared/FileDropZone";
import { uploadMedia } from "../../api/client";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function FileQueue() {
  const { files, selectedFileIds, addFiles, toggleFileSelection, selectAllFiles, deselectAllFiles } =
    useBatchStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddFilesClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    await uploadAndAdd(picked);
    e.target.value = "";
  };

  const handleFileDrop = async (dropped: File[]) => {
    await uploadAndAdd(dropped);
  };

  const uploadAndAdd = async (rawFiles: File[]) => {
    const uploaded = await Promise.all(
      rawFiles.map((f) => uploadMedia(f).then((r) => r.data))
    );
    addFiles(uploaded);
  };

  const allSelected = files.length > 0 && selectedFileIds.size === files.length;
  const noneSelected = selectedFileIds.size === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "10px 12px 8px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span className="section-label">File Queue</span>
        <button className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: 12 }} onClick={handleAddFilesClick}>
          + Add Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,image/*"
          style={{ display: "none" }}
          onChange={handleInputChange}
        />
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 5 }}>
        {files.length === 0 && (
          <p style={{ color: "var(--text-secondary)", fontSize: 12, textAlign: "center", marginTop: 20 }}>
            No files added yet
          </p>
        )}
        {files.map((file) => {
          const isSelected = selectedFileIds.has(file.id);
          const borderColor = file.media_type === "video" ? "var(--accent)" : "var(--purple)";
          return (
            <div
              key={file.id}
              onClick={() => toggleFileSelection(file.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 4,
                background: "var(--bg-tertiary)",
                border: `1px solid ${isSelected ? borderColor : "var(--border)"}`,
                borderLeft: `3px solid ${borderColor}`,
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleFileSelection(file.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ accentColor: "var(--accent)", flexShrink: 0 }}
              />
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
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>
                  {file.format.toUpperCase()} · {formatSize(file.file_size_bytes)}
                </p>
              </div>
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: file.media_type === "video" ? "rgba(233,69,96,0.15)" : "rgba(83,52,131,0.3)",
                  color: file.media_type === "video" ? "var(--accent)" : "#a78bfa",
                  flexShrink: 0,
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {file.media_type}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer: select all / none + drop zone */}
      <div style={{ padding: 8, flexShrink: 0, borderTop: "1px solid var(--border)" }}>
        {files.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 12 }}>
            <button
              onClick={selectAllFiles}
              disabled={allSelected}
              style={{
                background: "none",
                border: "none",
                color: allSelected ? "var(--text-secondary)" : "var(--accent)",
                cursor: allSelected ? "default" : "pointer",
                padding: 0,
                fontSize: 12,
              }}
            >
              Select all
            </button>
            <span style={{ color: "var(--text-secondary)" }}>·</span>
            <button
              onClick={deselectAllFiles}
              disabled={noneSelected}
              style={{
                background: "none",
                border: "none",
                color: noneSelected ? "var(--text-secondary)" : "var(--accent)",
                cursor: noneSelected ? "default" : "pointer",
                padding: 0,
                fontSize: 12,
              }}
            >
              None
            </button>
            <span style={{ marginLeft: "auto", color: "var(--text-secondary)" }}>
              {selectedFileIds.size}/{files.length}
            </span>
          </div>
        )}
        <FileDropZone onFilesDropped={handleFileDrop} compact label="Drop files to import" />
      </div>
    </div>
  );
}
