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


def chroma_similarity(color, background) -> float:
    color_mean = sum(color) / 3.0
    background_mean = sum(background) / 3.0
    color_vector = tuple(channel - color_mean for channel in color)
    background_vector = tuple(channel - background_mean for channel in background)
    color_norm = math.sqrt(sum(channel * channel for channel in color_vector))
    background_norm = math.sqrt(sum(channel * channel for channel in background_vector))
    if color_norm < 5.0 or background_norm < 5.0:
        return -1.0
    return sum(a * b for a, b in zip(color_vector, background_vector)) / (color_norm * background_norm)


def build_alpha_matte(
    image,
    background,
    tolerance: float,
    feather: float,
    island_feather: float,
    edge_contract: int,
    blur_radius: float,
):
    from PIL import Image, ImageChops, ImageDraw, ImageFilter

    rgb_source = image.convert("RGB")
    background_strength: list[int] = []
    broad_candidates: list[int] = []
    high_confidence: list[int] = []
    island_strength: list[int] = []
    connectivity_limit = tolerance + min(feather, 64.0)

    for red, green, blue in image_pixels(rgb_source):
        distance = math.sqrt(
            (red - background[0]) ** 2
            + (green - background[1]) ** 2
            + (blue - background[2]) ** 2
        )
        if distance <= tolerance:
            strength = 255
        elif feather == 0 or distance >= tolerance + feather:
            strength = 0
        else:
            strength = round(255 * (1.0 - smoothstep((distance - tolerance) / feather)))
        background_strength.append(strength)
        broad_candidates.append(255 if distance <= connectivity_limit else 0)
        high_confidence.append(255 if distance <= tolerance else 0)
        extended_feather = feather + island_feather
        if chroma_similarity((red, green, blue), background) < 0.45:
            island_strength.append(0)
        elif distance <= tolerance:
            island_strength.append(255)
        elif extended_feather == 0 or distance >= tolerance + extended_feather:
            island_strength.append(0)
        else:
            island_strength.append(
                round(255 * (1.0 - smoothstep((distance - tolerance) / extended_feather)))
            )

    candidates = Image.new("L", rgb_source.size)
    candidates.putdata(broad_candidates)
    width, height = rgb_source.size
    for point in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        if candidates.getpixel(point) == 255:
            ImageDraw.floodfill(candidates, point, 128, thresh=0)

    connected = [value == 128 for value in image_pixels(candidates)]
    matte_data = [
        max(strength if is_connected else 0, certain, island)
        for strength, is_connected, certain, island in zip(
            background_strength,
            connected,
            high_confidence,
            island_strength,
        )
    ]
    background_matte = Image.new("L", rgb_source.size)
    background_matte.putdata(matte_data)

    if edge_contract > 0:
        background_matte = background_matte.filter(ImageFilter.MaxFilter(edge_contract * 2 + 1))
    if blur_radius > 0:
        background_matte = background_matte.filter(ImageFilter.GaussianBlur(blur_radius))

    alpha = ImageChops.invert(background_matte)
    source_alpha = image.convert("RGBA").getchannel("A")
    return ImageChops.multiply(alpha, source_alpha)


def reconstruct_edge_colors(source, alpha_matte, background, tolerance: float, feather: float, radius: int):
    from PIL import ImageFilter

    if radius <= 0:
        return list(image_pixels(source))

    width, height = source.size
    source_pixels = list(image_pixels(source))
    alpha_pixels = list(image_pixels(alpha_matte))
    boundary_band = list(image_pixels(alpha_matte.filter(ImageFilter.MinFilter(3))))
    reliable_distance = tolerance + min(feather, 64.0) + 30.0
    reliable_foreground = []
    for (red, green, blue, _), alpha in zip(source_pixels, alpha_pixels):
        distance = math.sqrt(
            (red - background[0]) ** 2
            + (green - background[1]) ** 2
            + (blue - background[2]) ** 2
        )
        reliable_foreground.append(alpha >= 250 and distance >= reliable_distance)
    reconstructed = list(source_pixels)

    for index, alpha in enumerate(alpha_pixels):
        if alpha == 0 or boundary_band[index] == 255 or reliable_foreground[index]:
            continue
        x = index % width
        y = index // width
        weighted = [0.0, 0.0, 0.0]
        total_weight = 0.0

        for offset_y in range(-radius, radius + 1):
            candidate_y = y + offset_y
            if candidate_y < 0 or candidate_y >= height:
                continue
            for offset_x in range(-radius, radius + 1):
                candidate_x = x + offset_x
                if candidate_x < 0 or candidate_x >= width:
                    continue
                distance_squared = offset_x * offset_x + offset_y * offset_y
                if distance_squared == 0 or distance_squared > radius * radius:
                    continue
                candidate_index = candidate_y * width + candidate_x
                if not reliable_foreground[candidate_index]:
                    continue
                weight = 1.0 / distance_squared
                candidate = source_pixels[candidate_index]
                for channel in range(3):
                    weighted[channel] += candidate[channel] * weight
                total_weight += weight

        if total_weight > 0:
            reconstructed[index] = (
                *(round(channel / total_weight) for channel in weighted),
                source_pixels[index][3],
            )
        elif alpha < 255:
            coverage = max(alpha / 255.0, 1 / 255.0)
            channels = []
            for channel, background_channel in zip(source_pixels[index][:3], background):
                foreground = (channel - (1.0 - coverage) * background_channel) / coverage
                channels.append(round(max(0.0, min(255.0, foreground))))
            reconstructed[index] = (*channels, source_pixels[index][3])

    return reconstructed


def remove_background(
    image,
    background,
    tolerance: float,
    feather: float,
    island_feather: float,
    edge_contract: int,
    blur_radius: float,
    decontaminate_radius: int,
    decontaminate: bool,
):
    source = image.convert("RGBA")
    alpha_matte = build_alpha_matte(
        source,
        background,
        tolerance,
        feather,
        island_feather,
        edge_contract,
        blur_radius,
    )
    color_pixels = (
        reconstruct_edge_colors(
            source,
            alpha_matte,
            background,
            tolerance,
            feather,
            decontaminate_radius,
        )
        if decontaminate
        else list(image_pixels(source))
    )
    output_pixels = []
    transparent_pixels = 0

    for (red, green, blue, _), alpha in zip(color_pixels, image_pixels(alpha_matte)):
        if alpha == 0:
            output_pixels.append((0, 0, 0, 0))
            transparent_pixels += 1
            continue

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
    parser.add_argument("--tolerance", type=float, default=28.0, help="高置信度背景的色差范围，默认 28")
    parser.add_argument("--feather", type=float, default=160.0, help="连通背景的颜色羽化范围，默认 160")
    parser.add_argument(
        "--island-feather",
        type=float,
        default=100.0,
        help="同背景色相的封闭背景岛额外羽化范围，默认 100",
    )
    parser.add_argument(
        "--edge-contract",
        type=int,
        default=2,
        help="向主体内收缩背景遮罩的像素数，用于清除彩边，默认 2",
    )
    parser.add_argument("--blur-radius", type=float, default=0.8, help="Alpha 边缘高斯模糊半径，默认 0.8")
    parser.add_argument(
        "--decontaminate-radius",
        type=int,
        default=6,
        help="从主体内部延展边缘颜色的搜索半径，默认 6",
    )
    parser.add_argument("--crop", action="store_true", help="按非透明主体自动裁边")
    parser.add_argument("--padding", type=int, default=0, help="裁边后保留的透明像素，默认 0")
    parser.add_argument("--no-decontaminate", action="store_true", help="关闭半透明边缘的背景色去污")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出处理结果")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.tolerance < 0 or args.feather < 0 or args.island_feather < 0 or args.blur_radius < 0:
        parser.error("tolerance、feather、island-feather 和 blur-radius 不能为负数")
    if args.edge_contract < 0:
        parser.error("edge-contract 不能为负数")
    if args.decontaminate_radius < 0:
        parser.error("decontaminate-radius 不能为负数")
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
            args.island_feather,
            args.edge_contract,
            args.blur_radius,
            args.decontaminate_radius,
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
        "island_feather": args.island_feather,
        "edge_contract": args.edge_contract,
        "blur_radius": args.blur_radius,
        "decontaminate_radius": args.decontaminate_radius,
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
