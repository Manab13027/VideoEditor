"""Batch processing service — applies FFmpeg operations to files sequentially."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.models.job import BatchOperation
from backend.services import ffmpeg_service


def _get_output_filename(
    original: str,
    operation_type: str,
    pattern: str,
    target_format: Optional[str],
) -> str:
    """Generate an output filename from the naming pattern."""
    stem = Path(original).stem
    ext = Path(original).suffix

    if target_format:
        ext = f".{target_format.lstrip('.')}"

    name = pattern.format(original=stem, operation=operation_type)
    return f"{name}{ext}"


def process_single_file(
    stored_path: str,
    filename: str,
    operations: List[Dict[str, Any]],
    output_dir: str,
    naming_pattern: str,
) -> Dict[str, Any]:
    """Process one file through all operations sequentially.

    Returns dict with keys: status, output_path (on success), error (on failure).
    """
    os.makedirs(output_dir, exist_ok=True)

    current_input = stored_path
    last_output = stored_path

    for i, op_dict in enumerate(operations):
        op = BatchOperation(**op_dict) if isinstance(op_dict, dict) else op_dict
        op_type = op.type

        out_filename = _get_output_filename(
            filename if i == 0 else Path(last_output).name,
            op_type,
            naming_pattern,
            op.target_format,
        )
        output_path = str(Path(output_dir) / out_filename)

        try:
            if op_type == "convert":
                codec = op.codec or "libx264"
                target_fmt = op.target_format or "mp4"
                out_with_ext = str(Path(output_dir) / f"{Path(filename).stem}_{op_type}.{target_fmt.lstrip('.')}")
                ffmpeg_service.convert_format(current_input, out_with_ext, codec=codec)
                output_path = out_with_ext

            elif op_type == "crop":
                w = op.width or 640
                h = op.height or 480
                ffmpeg_service.crop_video(current_input, output_path, x=0, y=0, w=w, h=h)

            elif op_type == "watermark":
                if not op.watermark_path:
                    raise ValueError("watermark operation requires watermark_path")
                opacity = op.watermark_opacity if op.watermark_opacity is not None else 0.5
                ffmpeg_service.add_watermark(
                    current_input,
                    op.watermark_path,
                    output_path,
                    opacity=opacity,
                )

            elif op_type == "trim":
                start = op.trim_start or 0.0
                end = op.trim_end
                if end is None:
                    raise ValueError("trim operation requires trim_end")
                ffmpeg_service.trim_video(current_input, output_path, start, end)

            elif op_type == "thumbnail":
                ts = op.thumbnail_timestamp if op.thumbnail_timestamp is not None else 1.0
                fmt = op.thumbnail_format or "jpg"
                thumb_out = str(
                    Path(output_dir) / f"{Path(filename).stem}_{op_type}.{fmt.lstrip('.')}"
                )
                ffmpeg_service.generate_thumbnail(current_input, thumb_out, timestamp=ts)
                output_path = thumb_out

            elif op_type == "compress":
                quality = op.quality or "medium"
                ffmpeg_service.compress_video(current_input, output_path, quality=quality)

            else:
                raise ValueError(f"Unknown operation type: {op_type!r}")

        except Exception as exc:
            return {"status": "failed", "error": str(exc)}

        current_input = output_path
        last_output = output_path

    return {"status": "completed", "output_path": last_output}
