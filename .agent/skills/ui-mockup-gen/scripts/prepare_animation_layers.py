"""Prepare owned transparent layers from a combined animation source and explicit masks."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_mask(path: Path, expected_size, label: str):
    from PIL import Image, ImageChops, UnidentifiedImageError

    try:
        with Image.open(path) as opened:
            image = opened.convert("RGBA")
    except (OSError, UnidentifiedImageError) as exc:
        raise ValueError(f"无法读取{label}: {exc}") from exc
    if image.size != expected_size:
        raise ValueError(f"{label}尺寸 {image.size} 与源图 {expected_size} 不一致")
    luminance = image.convert("L")
    return ImageChops.multiply(luminance, image.getchannel("A"))


def process_mask(mask, grow: int, feather: float):
    from PIL import ImageFilter

    if grow > 0:
        mask = mask.filter(ImageFilter.MaxFilter(grow * 2 + 1))
    elif grow < 0:
        mask = mask.filter(ImageFilter.MinFilter(abs(grow) * 2 + 1))
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


def binary_mask(mask, threshold: int):
    return mask.point(lambda value: 255 if value >= threshold else 0)


def apply_matte(source, matte):
    from PIL import ImageChops

    result = source.copy()
    result.putalpha(ImageChops.multiply(source.getchannel("A"), matte))
    return result


def reconstruct_effect(source, effect_matte, subject_owner, max_gap: int):
    """Fill subject-occluded effect pixels from visible samples on the same scanline."""

    from PIL import Image

    result = apply_matte(source, effect_matte)
    pixels = result.load()
    source_pixels = source.load()
    effect_pixels = effect_matte.load()
    owner_pixels = subject_owner.load()
    reconstructed = 0

    for y in range(source.height):
        valid = [
            x
            for x in range(source.width)
            if effect_pixels[x, y] > 0 and owner_pixels[x, y] == 0 and source_pixels[x, y][3] > 0
        ]
        if not valid:
            continue
        left_nearest = [None] * source.width
        right_nearest = [None] * source.width
        nearest = None
        valid_set = set(valid)
        for x in range(source.width):
            if x in valid_set:
                nearest = x
            left_nearest[x] = nearest
        nearest = None
        for x in range(source.width - 1, -1, -1):
            if x in valid_set:
                nearest = x
            right_nearest[x] = nearest

        for x in range(source.width):
            if effect_pixels[x, y] == 0 or owner_pixels[x, y] == 0:
                continue
            left = left_nearest[x]
            right = right_nearest[x]
            candidates = [item for item in (left, right) if item is not None and abs(item - x) <= max_gap]
            if not candidates:
                continue
            if left is not None and right is not None and right != left and right - left <= max_gap * 2:
                ratio = (x - left) / (right - left)
                left_rgba = source_pixels[left, y]
                right_rgba = source_pixels[right, y]
                rgba = tuple(round(a + (b - a) * ratio) for a, b in zip(left_rgba, right_rgba))
            else:
                sample_x = min(candidates, key=lambda item: abs(item - x))
                rgba = source_pixels[sample_x, y]
            matte_value = effect_pixels[x, y] / 255
            pixels[x, y] = (*rgba[:3], round(rgba[3] * matte_value))
            reconstructed += 1
    return result, reconstructed


def count_pixels(mask, threshold: int = 1) -> int:
    values = mask.get_flattened_data() if hasattr(mask, "get_flattened_data") else mask.getdata()
    return sum(value >= threshold for value in values)


def create_qa(source, subject, effect, output_path: Path, offset_y: int) -> None:
    from PIL import Image, ImageDraw

    width, height = source.size
    backgrounds = ((248, 249, 250, 255), (28, 32, 36, 255))
    panels = []
    for background in backgrounds:
        base = Image.new("RGBA", source.size, background)
        recomposed = base.copy()
        recomposed.alpha_composite(effect)
        recomposed.alpha_composite(subject)
        moved = base.copy()
        moved.alpha_composite(effect)
        moved.alpha_composite(subject, (0, offset_y))
        panels.extend((recomposed.convert("RGB"), moved.convert("RGB")))

    qa = Image.new("RGB", (width * 2, height * 2), (255, 255, 255))
    for index, panel in enumerate(panels):
        qa.paste(panel, ((index % 2) * width, (index // 2) * height))
    draw = ImageDraw.Draw(qa)
    labels = ("recomposed / light", f"subject y={offset_y} / light", "recomposed / dark", f"subject y={offset_y} / dark")
    for index, label in enumerate(labels):
        x = (index % 2) * width + 12
        y = (index // 2) * height + 12
        draw.rectangle((x - 4, y - 4, x + 190, y + 22), fill=(0, 0, 0))
        draw.text((x, y), label, fill=(255, 255, 255))
    qa.save(output_path, format="PNG", optimize=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="使用显式遮罩准备动画主体层和特效层")
    parser.add_argument("source", type=Path, help="已抠图的透明 PNG 源图")
    parser.add_argument("--subject-mask", type=Path, required=True, help="主体遮罩 PNG")
    parser.add_argument("--effect-mask", type=Path, required=True, help="特效遮罩 PNG")
    parser.add_argument("--output-dir", type=Path, required=True, help="输出目录")
    parser.add_argument("--name", required=True, help="输出文件名前缀")
    parser.add_argument("--subject-grow", type=int, default=0, help="主体遮罩膨胀像素，负值表示收缩")
    parser.add_argument("--effect-grow", type=int, default=0, help="特效遮罩膨胀像素，负值表示收缩")
    parser.add_argument("--subject-feather", type=float, default=0.8, help="主体遮罩羽化半径")
    parser.add_argument("--effect-feather", type=float, default=0.8, help="特效遮罩羽化半径")
    parser.add_argument("--ownership-threshold", type=int, default=16, help="判定图层所有权的遮罩阈值")
    parser.add_argument(
        "--overlap-policy",
        choices=("subject", "effect", "error", "reconstruct"),
        default="subject",
        help="遮罩重叠处理策略，默认主体优先",
    )
    parser.add_argument("--reconstruct-max-gap", type=int, default=256, help="同行特效插值的最大单侧距离")
    parser.add_argument("--max-unassigned-ratio", type=float, default=0.05, help="允许未分配源像素比例")
    parser.add_argument("--qa-subject-offset-y", type=int, default=-8, help="QA 中主体测试位移")
    parser.add_argument("--json", action="store_true", help="输出结构化结果")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if not args.name.strip() or Path(args.name).name != args.name or "/" in args.name or "\\" in args.name:
        print("错误: name 必须是非空文件名前缀", file=sys.stderr)
        sys.exit(2)
    if args.subject_feather < 0 or args.effect_feather < 0:
        print("错误: feather 不能为负数", file=sys.stderr)
        sys.exit(2)
    if not 1 <= args.ownership_threshold <= 255 or args.reconstruct_max_gap <= 0:
        print("错误: ownership-threshold 必须为 1–255，reconstruct-max-gap 必须大于 0", file=sys.stderr)
        sys.exit(2)
    if not 0 <= args.max_unassigned_ratio <= 1:
        print("错误: max-unassigned-ratio 必须在 0 到 1 之间", file=sys.stderr)
        sys.exit(2)

    source_path = args.source.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    try:
        from PIL import Image, ImageChops, UnidentifiedImageError

        try:
            with Image.open(source_path) as opened:
                if "A" not in opened.getbands():
                    raise ValueError("源图必须包含 Alpha 通道")
                source = opened.convert("RGBA")
        except (OSError, UnidentifiedImageError) as exc:
            raise ValueError(f"无法读取源图: {exc}") from exc
        subject_mask = process_mask(
            load_mask(args.subject_mask.expanduser().resolve(), source.size, "主体遮罩"),
            args.subject_grow,
            args.subject_feather,
        )
        effect_mask = process_mask(
            load_mask(args.effect_mask.expanduser().resolve(), source.size, "特效遮罩"),
            args.effect_grow,
            args.effect_feather,
        )
        subject_owner = binary_mask(subject_mask, args.ownership_threshold)
        effect_owner = binary_mask(effect_mask, args.ownership_threshold)
        overlap = ImageChops.multiply(subject_owner, effect_owner)
        overlap_pixels = count_pixels(overlap)

        reconstructed_pixels = 0
        if args.overlap_policy == "error" and overlap_pixels:
            raise ValueError(f"主体与特效遮罩重叠 {overlap_pixels} 像素")
        if args.overlap_policy == "subject":
            effect_mask = ImageChops.multiply(effect_mask, ImageChops.invert(subject_owner))
            subject = apply_matte(source, subject_mask)
            effect = apply_matte(source, effect_mask)
        elif args.overlap_policy == "effect":
            subject_mask = ImageChops.multiply(subject_mask, ImageChops.invert(effect_owner))
            subject = apply_matte(source, subject_mask)
            effect = apply_matte(source, effect_mask)
        elif args.overlap_policy == "reconstruct":
            subject = apply_matte(source, subject_mask)
            effect, reconstructed_pixels = reconstruct_effect(
                source, effect_mask, subject_owner, args.reconstruct_max_gap
            )
        else:
            subject = apply_matte(source, subject_mask)
            effect = apply_matte(source, effect_mask)

        if subject.getchannel("A").getbbox() is None or effect.getchannel("A").getbbox() is None:
            raise ValueError("处理后主体层或特效层为空")

        source_alpha = source.getchannel("A")
        owned_union = ImageChops.lighter(subject.getchannel("A"), effect.getchannel("A"))
        unassigned = ImageChops.subtract(source_alpha, owned_union)
        source_pixels = count_pixels(source_alpha)
        unassigned_pixels = count_pixels(unassigned)
        unassigned_ratio = unassigned_pixels / source_pixels
        if unassigned_ratio > args.max_unassigned_ratio:
            raise ValueError(
                f"未分配源像素比例 {unassigned_ratio:.4f} 超过阈值 {args.max_unassigned_ratio:.4f}"
            )

        output_dir.mkdir(parents=True, exist_ok=True)
        subject_path = output_dir / f"{args.name}-subject.png"
        effect_path = output_dir / f"{args.name}-effect.png"
        subject_mask_path = output_dir / f"{args.name}-subject-mask.png"
        effect_mask_path = output_dir / f"{args.name}-effect-mask.png"
        qa_path = output_dir / f"{args.name}-layers-qa.png"
        manifest_path = output_dir / f"{args.name}-layers.json"
        subject.save(subject_path, format="PNG", optimize=True)
        effect.save(effect_path, format="PNG", optimize=True)
        subject_mask.save(subject_mask_path, format="PNG", optimize=True)
        effect_mask.save(effect_mask_path, format="PNG", optimize=True)
        create_qa(source, subject, effect, qa_path, args.qa_subject_offset_y)

        manifest = {
            "version": 1,
            "source": str(source_path),
            "input_masks": {
                "subject": str(args.subject_mask.expanduser().resolve()),
                "effect": str(args.effect_mask.expanduser().resolve()),
            },
            "size": {"width": source.width, "height": source.height},
            "policy": args.overlap_policy,
            "parameters": {
                "subject_grow": args.subject_grow,
                "effect_grow": args.effect_grow,
                "subject_feather": args.subject_feather,
                "effect_feather": args.effect_feather,
                "ownership_threshold": args.ownership_threshold,
                "reconstruct_max_gap": args.reconstruct_max_gap,
                "max_unassigned_ratio": args.max_unassigned_ratio,
            },
            "metrics": {
                "source_pixels": source_pixels,
                "subject_pixels": count_pixels(subject.getchannel("A")),
                "effect_pixels": count_pixels(effect.getchannel("A")),
                "mask_overlap_pixels": overlap_pixels,
                "reconstructed_pixels": reconstructed_pixels,
                "unassigned_source_pixels": unassigned_pixels,
                "unassigned_source_ratio": round(unassigned_ratio, 6),
            },
            "files": {
                "subject": subject_path.name,
                "effect": effect_path.name,
                "subject_mask": subject_mask_path.name,
                "effect_mask": effect_mask_path.name,
                "qa": qa_path.name,
            },
        }
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        result = {
            "subject": str(subject_path),
            "effect": str(effect_path),
            "manifest": str(manifest_path),
            "qa": str(qa_path),
            **manifest["metrics"],
        }
    except (ValueError, OSError) as exc:
        print(f"错误: {exc}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"主体层: {result['subject']}")
        print(f"特效层: {result['effect']}")
        print(f"QA: {result['qa']}")


if __name__ == "__main__":
    main()
