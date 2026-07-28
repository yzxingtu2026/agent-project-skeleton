"""Compose deterministic transparent animation frames from a layered scene JSON file."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

from animation_assets_common import export_animation_assets


ANCHORS = {
    "top-left": (0.0, 0.0),
    "top-center": (0.5, 0.0),
    "center": (0.5, 0.5),
    "bottom-center": (0.5, 1.0),
    "bottom-left": (0.0, 1.0),
}


def number(value, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} 必须是有限数字")
    return float(value)


def anchor_point(value, label: str) -> tuple[float, float]:
    if isinstance(value, str) and value in ANCHORS:
        return ANCHORS[value]
    if isinstance(value, dict) and "x" in value and "y" in value:
        result = number(value["x"], f"{label}.x"), number(value["y"], f"{label}.y")
        if not 0 <= result[0] <= 1 or not 0 <= result[1] <= 1:
            raise ValueError(f"{label} 自定义坐标必须在 0 到 1 之间")
        return result
    raise ValueError(f"{label} 必须是预设锚点名称或包含 x、y 的对象")


def position_point(value, label: str, default) -> tuple[float, float]:
    if value is None:
        return default
    if isinstance(value, dict) and "x" in value and "y" in value:
        return number(value["x"], f"{label}.x"), number(value["y"], f"{label}.y")
    raise ValueError(f"{label} 必须是包含 x、y 像素坐标的对象")


def merged_transform(layer: dict, index: int) -> dict:
    base = dict(layer.get("transform", {}))
    states = layer.get("frames", [])
    if states:
        state = states[index % len(states)]
        if not isinstance(state, dict):
            raise ValueError(f"图层 {layer['id']} 的 frames[{index % len(states)}] 必须是对象")
        base.update(state)
    return {
        "x": number(base.get("x", 0), "transform.x"),
        "y": number(base.get("y", 0), "transform.y"),
        "scale_x": number(base.get("scale_x", base.get("scale", 1)), "transform.scale_x"),
        "scale_y": number(base.get("scale_y", base.get("scale", 1)), "transform.scale_y"),
        "rotation": number(base.get("rotation", 0), "transform.rotation"),
        "opacity": number(base.get("opacity", 1), "transform.opacity"),
    }


def transform_layer(source, canvas_size, anchor, position, transform):
    from PIL import Image

    if transform["scale_x"] <= 0 or transform["scale_y"] <= 0:
        raise ValueError("scale_x 和 scale_y 必须大于 0")
    if not 0 <= transform["opacity"] <= 1:
        raise ValueError("opacity 必须在 0 到 1 之间")

    anchor_x = anchor[0] * source.width
    anchor_y = anchor[1] * source.height
    target_x = position[0] + transform["x"]
    target_y = position[1] + transform["y"]
    radians = math.radians(transform["rotation"])
    cos_value = math.cos(radians)
    sin_value = math.sin(radians)
    sx = transform["scale_x"]
    sy = transform["scale_y"]

    # Pillow affine coefficients map output coordinates back into source coordinates.
    a = cos_value / sx
    b = sin_value / sx
    d = -sin_value / sy
    e = cos_value / sy
    c = anchor_x - a * target_x - b * target_y
    f = anchor_y - d * target_x - e * target_y
    rendered = source.transform(
        canvas_size,
        Image.Transform.AFFINE,
        (a, b, c, d, e, f),
        resample=Image.Resampling.BICUBIC,
    )
    if transform["opacity"] < 1:
        alpha = rendered.getchannel("A").point(lambda value: round(value * transform["opacity"]))
        rendered.putalpha(alpha)
    return rendered


def parse_args():
    parser = argparse.ArgumentParser(description="按分层场景配置生成确定性透明动画素材")
    parser.add_argument("scene", type=Path, help="动画场景 JSON")
    parser.add_argument("--output-dir", type=Path, help="覆盖配置中的输出目录")
    parser.add_argument("--name", help="覆盖配置中的动画名称")
    parser.add_argument("--preview-format", choices=("webp", "gif", "none"), default="webp")
    parser.add_argument("--json", action="store_true", help="输出结构化结果")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    scene_path = args.scene.expanduser().resolve()
    try:
        scene = json.loads(scene_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"错误: 无法读取场景配置: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        from PIL import Image, UnidentifiedImageError

        if scene.get("version") != 1:
            raise ValueError("场景配置 version 必须为 1")
        canvas = scene.get("canvas", {})
        width_value = number(canvas.get("width"), "canvas.width")
        height_value = number(canvas.get("height"), "canvas.height")
        frame_count_value = number(scene.get("frame_count"), "frame_count")
        if not width_value.is_integer() or not height_value.is_integer() or not frame_count_value.is_integer():
            raise ValueError("画布尺寸和 frame_count 必须是整数")
        width = int(width_value)
        height = int(height_value)
        frame_count = int(frame_count_value)
        fps = number(scene.get("fps", 10), "fps")
        name = args.name or scene.get("name")
        if width <= 0 or height <= 0 or frame_count <= 0 or fps <= 0:
            raise ValueError("画布尺寸、frame_count 和 fps 必须大于 0")
        if (
            not isinstance(name, str)
            or not name.strip()
            or Path(name).name != name
            or "/" in name
            or "\\" in name
        ):
            raise ValueError("name 必须是非空文件名前缀")
        output_dir_value = args.output_dir or scene.get("output_dir")
        if not output_dir_value:
            raise ValueError("必须通过 output_dir 或 --output-dir 指定输出目录")
        output_dir = Path(output_dir_value).expanduser()
        if args.output_dir:
            output_dir = output_dir.resolve()
        elif not output_dir.is_absolute():
            output_dir = (scene_path.parent / output_dir).resolve()

        raw_layers = scene.get("layers")
        if not isinstance(raw_layers, list) or not raw_layers:
            raise ValueError("layers 必须是非空数组")
        layers = []
        seen_ids = set()
        for raw in raw_layers:
            if not isinstance(raw, dict) or not isinstance(raw.get("id"), str):
                raise ValueError("每个图层必须包含字符串 id")
            if raw["id"] in seen_ids:
                raise ValueError(f"图层 id 重复: {raw['id']}")
            seen_ids.add(raw["id"])
            if not isinstance(raw.get("file"), str) or not raw["file"].strip():
                raise ValueError(f"图层 {raw['id']} 必须包含文件路径")
            states = raw.get("frames", [])
            if not isinstance(states, list) or (states and len(states) != frame_count):
                raise ValueError(f"图层 {raw['id']} 的 frames 必须为空或包含 {frame_count} 帧")
            file_path = Path(raw["file"]).expanduser()
            if not file_path.is_absolute():
                file_path = (scene_path.parent / file_path).resolve()
            try:
                image = Image.open(file_path).convert("RGBA")
            except (OSError, UnidentifiedImageError) as exc:
                raise ValueError(f"无法读取图层 {raw['id']}: {exc}") from exc
            anchor = anchor_point(raw.get("anchor", "center"), f"图层 {raw['id']}.anchor")
            position = position_point(
                raw.get("position"), f"图层 {raw['id']}.position", (width / 2, height / 2)
            )
            layers.append((raw, image, anchor, position, str(file_path)))

        frames = []
        frame_metadata = []
        for index in range(frame_count):
            frame = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            states = []
            for raw, image, anchor, position, file_path in layers:
                transform = merged_transform(raw, index)
                rendered = transform_layer(image, (width, height), anchor, position, transform)
                frame.alpha_composite(rendered)
                states.append({"id": raw["id"], "file": file_path, "transform": transform})
            frames.append(frame)
            frame_metadata.append({"layers": states})

        result = export_animation_assets(
            frames=frames,
            output_dir=output_dir,
            name=name,
            fps=fps,
            preview_format=args.preview_format,
            source={
                "type": "layered-scene",
                "scene": str(scene_path),
                "canvas": {"width": width, "height": height},
                "layers": [raw["id"] for raw, *_ in layers],
            },
            frame_metadata=frame_metadata,
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
