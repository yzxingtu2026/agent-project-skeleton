"""Build aligned animation assets from a transparent frame grid."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def union_box(boxes: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int]:
    return (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )


def expand_box(box, padding: int, width: int, height: int):
    return (
        max(0, box[0] - padding),
        max(0, box[1] - padding),
        min(width, box[2] + padding),
        min(height, box[3] + padding),
    )


def frame_metrics(frame) -> dict:
    alpha = frame.getchannel("A")
    bbox = alpha.getbbox()
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="从透明帧网格构建动画单帧、spritesheet、预览和 manifest")
    parser.add_argument("input", type=Path, help="透明帧网格 PNG")
    parser.add_argument("--rows", type=int, required=True, help="网格行数")
    parser.add_argument("--columns", type=int, required=True, help="网格列数")
    parser.add_argument("--frame-count", type=int, help="实际帧数，默认 rows * columns")
    parser.add_argument("--fps", type=float, default=10.0, help="播放帧率，默认 10")
    parser.add_argument("--name", required=True, help="输出文件名前缀")
    parser.add_argument("--output-dir", type=Path, required=True, help="输出目录")
    parser.add_argument("--trim", action="store_true", help="使用所有帧内容边界的并集统一裁切")
    parser.add_argument("--padding", type=int, default=0, help="联合裁切后保留的透明边距，默认 0")
    parser.add_argument(
        "--preview-format",
        choices=("webp", "gif", "none"),
        default="webp",
        help="循环预览格式，默认 webp",
    )
    parser.add_argument("--json", action="store_true", help="以 JSON 输出构建结果")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.rows <= 0 or args.columns <= 0:
        parser.error("rows 和 columns 必须大于 0")
    if args.fps <= 0:
        parser.error("fps 必须大于 0")
    if args.padding < 0:
        parser.error("padding 不能为负数")
    if not args.name.strip():
        parser.error("name 不能为空")
    if Path(args.name).name != args.name or "/" in args.name or "\\" in args.name:
        parser.error("name 不能包含目录分隔符")

    input_path = args.input.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if not input_path.is_file():
        parser.error(f"输入图片不存在: {input_path}")

    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError:
        print("错误: 需要 Pillow，请安装依赖: python -m pip install Pillow", file=sys.stderr)
        sys.exit(1)

    try:
        with Image.open(input_path) as opened:
            source = opened.convert("RGBA")
    except (OSError, UnidentifiedImageError) as exc:
        print(f"错误: 无法读取输入图片: {exc}", file=sys.stderr)
        sys.exit(1)

    if source.width % args.columns != 0 or source.height % args.rows != 0:
        parser.error(
            f"图片尺寸 {source.width}x{source.height} 不能被网格 {args.columns}x{args.rows} 整除"
        )

    available_frames = args.rows * args.columns
    frame_count = args.frame_count or available_frames
    if frame_count <= 0 or frame_count > available_frames:
        parser.error(f"frame-count 必须在 1 到 {available_frames} 之间")

    cell_width = source.width // args.columns
    cell_height = source.height // args.rows
    frames = []
    content_boxes = []
    for index in range(frame_count):
        row = index // args.columns
        column = index % args.columns
        frame = source.crop(
            (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            )
        )
        bbox = frame.getchannel("A").getbbox()
        if bbox is None:
            print(f"错误: 第 {index + 1} 帧为空白帧", file=sys.stderr)
            sys.exit(1)
        if bbox[0] == 0 or bbox[1] == 0 or bbox[2] == cell_width or bbox[3] == cell_height:
            print(f"错误: 第 {index + 1} 帧内容接触单元格边界，请重新生成帧网格", file=sys.stderr)
            sys.exit(1)
        frames.append(frame)
        content_boxes.append(bbox)

    trim_box = (0, 0, cell_width, cell_height)
    if args.trim:
        trim_box = expand_box(union_box(content_boxes), args.padding, cell_width, cell_height)
        frames = [frame.crop(trim_box) for frame in frames]

    frame_width, frame_height = frames[0].size
    duration_ms = max(1, round(1000 / args.fps))
    output_dir.mkdir(parents=True, exist_ok=True)
    frames_dir = output_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    frame_entries = []
    for index, frame in enumerate(frames):
        filename = f"{args.name}-{index:03d}.png"
        path = frames_dir / filename
        frame.save(path, format="PNG", optimize=True)
        metrics = frame_metrics(frame)
        frame_entries.append(
            {
                "index": index,
                "file": f"frames/{filename}",
                "x": index * frame_width,
                "y": 0,
                "width": frame_width,
                "height": frame_height,
                "duration_ms": duration_ms,
                **metrics,
            }
        )

    spritesheet = Image.new("RGBA", (frame_width * frame_count, frame_height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        spritesheet.paste(frame, (index * frame_width, 0))
    spritesheet_name = f"{args.name}-spritesheet.png"
    spritesheet.save(output_dir / spritesheet_name, format="PNG", optimize=True)

    preview_name = None
    if args.preview_format != "none":
        preview_name = f"{args.name}-preview.{args.preview_format}"
        preview_path = output_dir / preview_name
        save_kwargs = {
            "save_all": True,
            "append_images": frames[1:],
            "duration": duration_ms,
            "loop": 0,
        }
        if args.preview_format == "webp":
            save_kwargs.update({"format": "WEBP", "lossless": True, "method": 6})
        else:
            save_kwargs.update({"format": "GIF", "disposal": 2, "transparency": 0})
        try:
            frames[0].save(preview_path, **save_kwargs)
        except OSError as exc:
            print(f"错误: 无法生成 {args.preview_format} 预览: {exc}", file=sys.stderr)
            sys.exit(1)

    manifest = {
        "version": 1,
        "name": args.name,
        "frame_count": frame_count,
        "fps": args.fps,
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
        "source": {
            "file": str(input_path),
            "width": source.width,
            "height": source.height,
            "rows": args.rows,
            "columns": args.columns,
            "cell_width": cell_width,
            "cell_height": cell_height,
            "trimmed": args.trim,
            "trim_box": {
                "left": trim_box[0],
                "top": trim_box[1],
                "right": trim_box[2],
                "bottom": trim_box[3],
            },
        },
        "frames": frame_entries,
    }
    manifest_name = f"{args.name}-manifest.json"
    (output_dir / manifest_name).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    result = {
        "output_dir": str(output_dir),
        "manifest": str(output_dir / manifest_name),
        "spritesheet": str(output_dir / spritesheet_name),
        "preview": str(output_dir / preview_name) if preview_name else None,
        "frame_count": frame_count,
        "frame_size": {"width": frame_width, "height": frame_height},
        "duration_ms": duration_ms,
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"已输出: {output_dir}")
        print(f"帧数: {frame_count}")
        print(f"帧尺寸: {frame_width}x{frame_height}")
        print(f"Spritesheet: {output_dir / spritesheet_name}")
        if preview_name:
            print(f"预览: {output_dir / preview_name}")
        print(f"Manifest: {output_dir / manifest_name}")


if __name__ == "__main__":
    main()
