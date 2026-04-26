import { useDropzone } from "react-dropzone";

interface FileDropZoneProps {
  onFilesDropped: (files: File[]) => void;
  label?: string;
  compact?: boolean;
}

export function FileDropZone({
  onFilesDropped,
  label = "Drop files here or click to browse",
  compact = false,
}: FileDropZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onFilesDropped,
    accept: {
      "video/*": [],
      "image/*": [],
      "audio/*": [],
    },
  });

  return (
    <div
      {...getRootProps()}
      style={{
        border: `2px dashed ${isDragActive ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 6,
        padding: compact ? "12px 16px" : "32px 24px",
        textAlign: "center",
        cursor: "pointer",
        background: isDragActive ? "rgba(233,69,96,0.05)" : "transparent",
        transition: "border-color 0.15s, background 0.15s",
        color: isDragActive ? "var(--accent)" : "var(--text-secondary)",
        fontSize: 13,
      }}
    >
      <input {...getInputProps()} />
      <p>{isDragActive ? "Release to drop" : label}</p>
    </div>
  );
}
