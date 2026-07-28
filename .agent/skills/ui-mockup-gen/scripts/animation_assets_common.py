"""Shared validation and export helpers for transparent animation assets."""

from __future__ import annotations

import json
from pathlib import Path


def alpha_bbox(image, threshold: int = 1):
    alpha = image.getchannel("A")
    if threshold > 1:
        alpha = alpha.point(lambda value: 255 if value >= threshold else 0)
    return alpha.getbbox()


def frame_metrics(frame) -> dict:
    alpha = frame.getchannel("A")
    bbox = alpha_bbox(frame)
    if bbox is None:
        raise ValueError("检测到空白帧")
    histogram_x = [0] * frame.width
    histogram_y = [0] * frame.height
    alpha_sum = 0
    for y in range(frame.height):
        for x in range(frame.width):
            value = alpha.getpixel((x, y))
            if value == 0:
                continue
            histogram_x[x] += value
            histogram_y[y] += value
            alpha_sum += value
    centroid_x = sum(index * value for index, value in enumerate(histogram_x)) / alpha_sum
    centroid_y = sum(index * value for index, value in enumerate(histogram_y)) / alpha_sum
    return {
        "content_bbox": {"left": bbox[0], "top": bbox[1], "right": bbox[2], "bottom": bbox[3]},
        "centroid": {"x": round(centroid_x, 2), "y": round(centroid_y, 2)},
        "alpha_coverage": round(alpha_sum / (255 * frame.width * frame.height), 4),
    }


def ensure_content_margin(frames, margin: int = 1) -> None:
    for index, frame in enumerate(frames):
        bbox = alpha_bbox(frame)
        if bbox is None:
            raise ValueError(f"第 {index + 1} 帧为空白帧")
        if (
            bbox[0] < margin
            or bbox[1] < margin
            or frame.width - bbox[2] < margin
            or frame.height - bbox[3] < margin
        ):
            raise ValueError(f"第 {index + 1} 帧内容接触画布边界")


def export_animation_assets(
    *,
    frames,
    output_dir: Path,
    name: str,
    fps: float,
    preview_format: str,
    source: dict,
    frame_metadata: list[dict] | None = None,
) -> dict:
    from PIL import Image

    if not frames:
        raise ValueError("没有可输出的动画帧")
    sizes = {frame.size for frame in frames}
    if len(sizes) != 1:
        raise ValueError("所有动画帧必须等宽等高")
    ensure_content_margin(frames)

    frame_width, frame_height = frames[0].size
    duration_ms = max(1, round(1000 / fps))
    output_dir.mkdir(parents=True, exist_ok=True)
    frames_dir = output_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    for stale_frame in frames_dir.glob(f"{name}-*.png"):
        stale_frame.unlink()

    frame_entries = []
    metadata = frame_metadata or [{} for _ in frames]
    for index, (frame, extra) in enumerate(zip(frames, metadata, strict=True)):
        filename = f"{name}-{index:03d}.png"
        frame.save(frames_dir / filename, format="PNG", optimize=True)
        frame_entries.append(
            {
                "index": index,
                "file": f"frames/{filename}",
                "x": index * frame_width,
                "y": 0,
                "width": frame_width,
                "height": frame_height,
                "duration_ms": duration_ms,
                **frame_metrics(frame),
                **extra,
            }
        )

    spritesheet = Image.new("RGBA", (frame_width * len(frames), frame_height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        spritesheet.alpha_composite(frame, (index * frame_width, 0))
    spritesheet_name = f"{name}-spritesheet.png"
    spritesheet.save(output_dir / spritesheet_name, format="PNG", optimize=True)

    preview_name = None
    if preview_format != "none":
        preview_name = f"{name}-preview.{preview_format}"
        save_kwargs = {
            "save_all": True,
            "append_images": frames[1:],
            "duration": duration_ms,
            "loop": 0,
        }
        if preview_format == "webp":
            save_kwargs.update({"format": "WEBP", "lossless": True, "method": 6})
        else:
            save_kwargs.update({"format": "GIF", "disposal": 2, "transparency": 0})
        frames[0].save(output_dir / preview_name, **save_kwargs)

    manifest = {
        "version": 2,
        "name": name,
        "frame_count": len(frames),
        "fps": fps,
        "duration_ms": duration_ms,
        "loop": True,
        "frame": {"width": frame_width, "height": frame_height},
        "spritesheet": {
            "file": spritesheet_name,
            "layout": "horizontal",
            "width": spritesheet.width,
            "height": spritesheet.height,
        },
        "preview": preview_name,
        "source": source,
        "frames": frame_entries,
    }
    manifest_name = f"{name}-manifest.json"
    (output_dir / manifest_name).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return {
        "output_dir": str(output_dir),
        "manifest": str(output_dir / manifest_name),
        "spritesheet": str(output_dir / spritesheet_name),
        "preview": str(output_dir / preview_name) if preview_name else None,
        "frame_count": len(frames),
        "frame_size": {"width": frame_width, "height": frame_height},
        "duration_ms": duration_ms,
    }
