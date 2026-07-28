"""Normalize a generated transparent frame grid and build animation assets."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from pathlib import Path

from animation_assets_common import alpha_bbox, export_animation_assets


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


def parse_region(value: str) -> tuple[float, float, float, float]:
    try:
        values = tuple(float(item.strip()) for item in value.split(","))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("anchor-region 必须是 x,y,width,height") from exc
    if len(values) != 4:
        raise argparse.ArgumentTypeError("anchor-region 必须包含 4 个数字")
    x, y, width, height = values
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1 or y + height > 1:
        raise argparse.ArgumentTypeError("anchor-region 必须位于 0 到 1 的归一化画布内")
    return values


def region_box(frame, region):
    x, y, width, height = region
    return (
        round(x * frame.width),
        round(y * frame.height),
        round((x + width) * frame.width),
        round((y + height) * frame.height),
    )


def anchor_metrics(frame, kind: str, region, threshold: int) -> dict:
    crop_box = region_box(frame, region)
    alpha = frame.getchannel("A").crop(crop_box)
    binary = alpha.point(lambda value: 255 if value >= threshold else 0)
    bbox = binary.getbbox()
    if bbox is None:
        raise ValueError("稳定区域内没有检测到有效主体")
    left = bbox[0] + crop_box[0]
    top = bbox[1] + crop_box[1]
    right = bbox[2] + crop_box[0]
    bottom = bbox[3] + crop_box[1]
    if kind == "center":
        x = (left + right) / 2
        y = (top + bottom) / 2
    elif kind == "bottom-center":
        x = (left + right) / 2
        y = bottom
    elif kind == "centroid":
        alpha_sum = 0
        weighted_x = 0
        weighted_y = 0
        for local_y in range(alpha.height):
            for local_x in range(alpha.width):
                value = alpha.getpixel((local_x, local_y))
                if value < threshold:
                    continue
                alpha_sum += value
                weighted_x += (local_x + crop_box[0]) * value
                weighted_y += (local_y + crop_box[1]) * value
        x = weighted_x / alpha_sum
        y = weighted_y / alpha_sum
    else:
        raise ValueError(f"未知锚点类型: {kind}")
    return {
        "x": x,
        "y": y,
        "bbox": (left, top, right, bottom),
        "width": right - left,
        "height": bottom - top,
    }


def translate_frame(frame, dx: int, dy: int):
    from PIL import Image

    result = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    result.alpha_composite(frame, (dx, dy))
    return result


def load_motion_plan(path: Path | None, frame_count: int) -> list[dict]:
    if path is None:
        return [{"x": 0, "y": 0} for _ in range(frame_count)]
    try:
        data = json.loads(path.expanduser().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"无法读取运动计划: {exc}") from exc
    states = data.get("frames") if isinstance(data, dict) else data
    if not isinstance(states, list) or len(states) != frame_count:
        raise ValueError(f"运动计划必须包含 {frame_count} 个 frames")
    result = []
    for index, state in enumerate(states):
        if not isinstance(state, dict):
            raise ValueError(f"运动计划第 {index + 1} 帧必须是对象")
        x = state.get("x", 0)
        y = state.get("y", 0)
        if (
            isinstance(x, bool)
            or isinstance(y, bool)
            or not isinstance(x, (int, float))
            or not isinstance(y, (int, float))
            or not math.isfinite(x)
            or not math.isfinite(y)
        ):
            raise ValueError(f"运动计划第 {index + 1} 帧的 x、y 必须是有限数字")
        result.append({"x": round(x), "y": round(y)})
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="从透明帧网格归一化并构建动画素材")
    parser.add_argument("input", type=Path, help="透明帧网格 PNG")
    parser.add_argument("--rows", type=int, required=True, help="网格行数")
    parser.add_argument("--columns", type=int, required=True, help="网格列数")
    parser.add_argument("--frame-count", type=int, help="实际帧数，默认 rows * columns")
    parser.add_argument("--fps", type=float, default=10.0, help="播放帧率，默认 10")
    parser.add_argument("--name", required=True, help="输出文件名前缀")
    parser.add_argument("--output-dir", type=Path, required=True, help="输出目录")
    parser.add_argument("--trim", action="store_true", help="使用所有帧内容边界的并集统一裁切")
    parser.add_argument("--padding", type=int, default=0, help="联合裁切后保留的透明边距")
    parser.add_argument(
        "--stabilize-anchor",
        choices=("none", "center", "bottom-center", "centroid"),
        default="none",
        help="使用稳定主体区域归一化锚点，默认不处理",
    )
    parser.add_argument(
        "--anchor-region",
        type=parse_region,
        default=(0.0, 0.0, 1.0, 1.0),
        help="锚点检测区域 x,y,width,height，使用 0 到 1 的归一化坐标",
    )
    parser.add_argument("--alpha-threshold", type=int, default=16, help="锚点检测 Alpha 阈值")
    parser.add_argument("--motion-plan", type=Path, help="归一化后施加的逐帧 x/y JSON 计划")
    parser.add_argument("--max-anchor-error", type=float, default=1.0, help="允许的锚点误差像素")
    parser.add_argument("--max-scale-deviation", type=float, default=0.08, help="稳定区域尺寸偏差比例")
    parser.add_argument("--allow-scale-drift", action="store_true", help="允许稳定区域尺寸超过阈值")
    parser.add_argument(
        "--preview-format", choices=("webp", "gif", "none"), default="webp", help="循环预览格式"
    )
    parser.add_argument("--json", action="store_true", help="输出结构化结果")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.rows <= 0 or args.columns <= 0 or args.fps <= 0:
        parser.error("rows、columns 和 fps 必须大于 0")
    if args.padding < 0 or not 1 <= args.alpha_threshold <= 255:
        parser.error("padding 不能为负数，alpha-threshold 必须在 1 到 255 之间")
    if args.max_anchor_error < 0 or args.max_scale_deviation < 0:
        parser.error("质量阈值不能为负数")
    if not args.name.strip() or Path(args.name).name != args.name or "/" in args.name or "\\" in args.name:
        parser.error("name 必须是非空文件名前缀")

    input_path = args.input.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if not input_path.is_file():
        parser.error(f"输入图片不存在: {input_path}")
    try:
        from PIL import Image, UnidentifiedImageError

        with Image.open(input_path) as opened:
            source = opened.convert("RGBA")
    except ImportError:
        print("错误: 需要 Pillow，请安装依赖: python -m pip install Pillow", file=sys.stderr)
        sys.exit(1)
    except (OSError, UnidentifiedImageError) as exc:
        print(f"错误: 无法读取输入图片: {exc}", file=sys.stderr)
        sys.exit(1)

    if source.width % args.columns != 0 or source.height % args.rows != 0:
        parser.error(f"图片尺寸 {source.width}x{source.height} 不能被网格整除")
    available_frames = args.rows * args.columns
    frame_count = args.frame_count or available_frames
    if frame_count <= 0 or frame_count > available_frames:
        parser.error(f"frame-count 必须在 1 到 {available_frames} 之间")

    cell_width = source.width // args.columns
    cell_height = source.height // args.rows
    frames = []
    for index in range(frame_count):
        row, column = divmod(index, args.columns)
        frame = source.crop(
            (column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height)
        )
        bbox = alpha_bbox(frame)
        if bbox is None:
            print(f"错误: 第 {index + 1} 帧为空白帧", file=sys.stderr)
            sys.exit(1)
        if bbox[0] == 0 or bbox[1] == 0 or bbox[2] == cell_width or bbox[3] == cell_height:
            print(f"错误: 第 {index + 1} 帧内容接触单元格边界", file=sys.stderr)
            sys.exit(1)
        frames.append(frame)

    try:
        motion = load_motion_plan(args.motion_plan, frame_count)
        alignment = None
        metadata = [{} for _ in frames]
        if args.stabilize_anchor != "none":
            raw = [
                anchor_metrics(frame, args.stabilize_anchor, args.anchor_region, args.alpha_threshold)
                for frame in frames
            ]
            target_x = statistics.median(item["x"] for item in raw)
            target_y = statistics.median(item["y"] for item in raw)
            median_width = statistics.median(item["width"] for item in raw)
            median_height = statistics.median(item["height"] for item in raw)
            deviations = [
                max(abs(item["width"] / median_width - 1), abs(item["height"] / median_height - 1))
                for item in raw
            ]
            max_deviation = max(deviations)
            if max_deviation > args.max_scale_deviation and not args.allow_scale_drift:
                raise ValueError(
                    f"稳定主体尺寸偏差 {max_deviation:.3f} 超过阈值 {args.max_scale_deviation:.3f}，"
                    "应重新生成或明确使用 --allow-scale-drift"
                )
            aligned = []
            errors = []
            for index, (frame, item, planned) in enumerate(zip(frames, raw, motion, strict=True)):
                normalize_x = round(target_x - item["x"])
                normalize_y = round(target_y - item["y"])
                dx = normalize_x + planned["x"]
                dy = normalize_y + planned["y"]
                transformed = translate_frame(frame, dx, dy)
                final_anchor = anchor_metrics(
                    transformed, args.stabilize_anchor, args.anchor_region, args.alpha_threshold
                )
                expected_x = target_x + planned["x"]
                expected_y = target_y + planned["y"]
                error = math.hypot(final_anchor["x"] - expected_x, final_anchor["y"] - expected_y)
                errors.append(error)
                aligned.append(transformed)
                metadata[index] = {
                    "alignment": {
                        "raw_anchor": {"x": round(item["x"], 2), "y": round(item["y"], 2)},
                        "normalized_offset": {"x": normalize_x, "y": normalize_y},
                        "motion": planned,
                        "final_anchor": {"x": round(final_anchor["x"], 2), "y": round(final_anchor["y"], 2)},
                        "error": round(error, 3),
                        "scale_deviation": round(deviations[index], 4),
                    }
                }
            max_error = max(errors)
            if max_error > args.max_anchor_error:
                raise ValueError(
                    f"归一化后锚点误差 {max_error:.3f}px 超过阈值 {args.max_anchor_error:.3f}px"
                )
            frames = aligned
            alignment = {
                "anchor": args.stabilize_anchor,
                "region": args.anchor_region,
                "alpha_threshold": args.alpha_threshold,
                "target": {"x": round(target_x, 2), "y": round(target_y, 2)},
                "max_anchor_error": round(max_error, 3),
                "max_scale_deviation": round(max_deviation, 4),
            }
        elif args.motion_plan:
            frames = [translate_frame(frame, state["x"], state["y"]) for frame, state in zip(frames, motion, strict=True)]
            metadata = [{"motion": state} for state in motion]

        trim_box = (0, 0, cell_width, cell_height)
        if args.trim:
            boxes = [alpha_bbox(frame) for frame in frames]
            trim_box = expand_box(union_box(boxes), args.padding, cell_width, cell_height)
            frames = [frame.crop(trim_box) for frame in frames]

        result = export_animation_assets(
            frames=frames,
            output_dir=output_dir,
            name=args.name,
            fps=args.fps,
            preview_format=args.preview_format,
            source={
                "type": "generated-grid",
                "file": str(input_path),
                "width": source.width,
                "height": source.height,
                "rows": args.rows,
                "columns": args.columns,
                "cell_width": cell_width,
                "cell_height": cell_height,
                "trimmed": args.trim,
                "trim_box": {"left": trim_box[0], "top": trim_box[1], "right": trim_box[2], "bottom": trim_box[3]},
                "alignment": alignment,
            },
            frame_metadata=metadata,
        )
    except (ValueError, OSError) as exc:
        print(f"错误: {exc}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"已输出: {result['output_dir']}")
        print(f"帧数: {result['frame_count']}")
        print(f"预览: {result['preview']}")


if __name__ == "__main__":
    main()
