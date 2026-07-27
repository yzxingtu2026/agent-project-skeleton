"""Remove a solid-color background and save a transparent PNG."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from pathlib import Path


def parse_color(value: str) -> tuple[int, int, int] | None:
    normalized = value.strip()
    if normalized.lower() == "auto":
        return None
    if normalized.startswith("#"):
        normalized = normalized[1:]
        if len(normalized) != 6:
            raise argparse.ArgumentTypeError("十六进制背景色必须使用 #RRGGBB")
        try:
            return tuple(int(normalized[index : index + 2], 16) for index in (0, 2, 4))
        except ValueError as exc:
            raise argparse.ArgumentTypeError("背景色包含无效的十六进制字符") from exc

    parts = normalized.split(",")
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("背景色必须是 auto、#RRGGBB 或 R,G,B")
    try:
        color = tuple(int(part.strip()) for part in parts)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("RGB 背景色必须是整数") from exc
    if any(channel < 0 or channel > 255 for channel in color):
        raise argparse.ArgumentTypeError("RGB 通道必须在 0 到 255 之间")
    return color


def image_pixels(image):
    getter = getattr(image, "get_flattened_data", None)
    return getter() if getter else image.getdata()


def estimate_background(image) -> tuple[int, int, int]:
    width, height = image.size
    sample_size = max(1, min(width, height) // 20)
    boxes = (
        (0, 0, sample_size, sample_size),
        (width - sample_size, 0, width, sample_size),
        (0, height - sample_size, sample_size, height),
        (width - sample_size, height - sample_size, width, height),
    )
    samples: list[tuple[int, int, int]] = []
    for box in boxes:
        samples.extend(image_pixels(image.crop(box)))
    return tuple(round(statistics.median(pixel[channel] for pixel in samples)) for channel in range(3))


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def remove_background(image, background, tolerance: float, feather: float, decontaminate: bool):
    source = image.convert("RGBA")
    output_pixels = []
    transparent_pixels = 0

    for red, green, blue, source_alpha in image_pixels(source):
        distance = math.sqrt(
            (red - background[0]) ** 2
            + (green - background[1]) ** 2
            + (blue - background[2]) ** 2
        )
        if distance <= tolerance:
            key_alpha = 0
        elif feather == 0 or distance >= tolerance + feather:
            key_alpha = 255
        else:
            key_alpha = round(255 * smoothstep((distance - tolerance) / feather))

        alpha = round(source_alpha * key_alpha / 255)
        if alpha == 0:
            output_pixels.append((0, 0, 0, 0))
            transparent_pixels += 1
            continue

        if decontaminate and alpha < 255:
            coverage = max(alpha / 255.0, 1 / 255.0)
            channels = []
            for channel, background_channel in zip((red, green, blue), background):
                foreground = (channel - (1.0 - coverage) * background_channel) / coverage
                channels.append(round(max(0.0, min(255.0, foreground))))
            red, green, blue = channels

        output_pixels.append((red, green, blue, alpha))

    output = source.copy()
    output.putdata(output_pixels)
    return output, transparent_pixels


def crop_to_content(image, padding: int):
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("没有检测到非透明主体，请检查背景色和容差参数")
    if padding == 0:
        return image.crop(bbox)
    return image.crop(
        (
            bbox[0] - padding,
            bbox[1] - padding,
            bbox[2] + padding,
            bbox[3] + padding,
        )
    )


def default_output_path(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}-transparent.png")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="移除纯色背景并输出透明 PNG")
    parser.add_argument("input", type=Path, help="输入图片路径")
    parser.add_argument("--output", type=Path, help="输出 PNG 路径，默认添加 -transparent 后缀")
    parser.add_argument(
        "--background",
        type=parse_color,
        default=None,
        metavar="auto|#RRGGBB|R,G,B",
        help="背景色，默认从四角自动估算",
    )
    parser.add_argument("--tolerance", type=float, default=28.0, help="完全透明的色差范围，默认 28")
    parser.add_argument("--feather", type=float, default=20.0, help="透明边缘羽化范围，默认 20")
    parser.add_argument("--crop", action="store_true", help="按非透明主体自动裁边")
    parser.add_argument("--padding", type=int, default=0, help="裁边后保留的透明像素，默认 0")
    parser.add_argument("--no-decontaminate", action="store_true", help="关闭半透明边缘的背景色去污")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出处理结果")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.tolerance < 0 or args.feather < 0:
        parser.error("tolerance 和 feather 不能为负数")
    if args.padding < 0:
        parser.error("padding 不能为负数")

    input_path = args.input.expanduser().resolve()
    output_path = (args.output or default_output_path(input_path)).expanduser().resolve()
    if not input_path.is_file():
        parser.error(f"输入图片不存在: {input_path}")
    if output_path.suffix.lower() != ".png":
        parser.error("输出文件必须使用 .png 扩展名")
    if input_path == output_path:
        parser.error("输出路径不能覆盖输入图片")

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

    rgb_source = source.convert("RGB")
    background = args.background or estimate_background(rgb_source)

    try:
        result, transparent_pixels = remove_background(
            source,
            background,
            args.tolerance,
            args.feather,
            not args.no_decontaminate,
        )
        if result.getchannel("A").getbbox() is None:
            raise ValueError("没有检测到非透明主体，请检查背景色和容差参数")
        if args.crop:
            result = crop_to_content(result, args.padding)
    except ValueError as exc:
        print(f"错误: {exc}", file=sys.stderr)
        sys.exit(1)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    result.save(output_path, format="PNG", optimize=True)

    payload = {
        "input": str(input_path),
        "output": str(output_path),
        "background": "#{:02X}{:02X}{:02X}".format(*background),
        "tolerance": args.tolerance,
        "feather": args.feather,
        "cropped": args.crop,
        "size": {"width": result.width, "height": result.height},
        "transparent_pixel_ratio": round(transparent_pixels / (source.width * source.height), 4),
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"已输出: {output_path}")
        print(f"背景色: {payload['background']}")
        print(f"尺寸: {result.width}x{result.height}")
        print(f"透明像素占比: {payload['transparent_pixel_ratio']:.2%}")


if __name__ == "__main__":
    main()
