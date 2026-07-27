"""通用 UI 参考图异步生成器。

用法：
    # 启动后台生成任务
    python generate_mockup.py start --prompt "为餐厅点餐后台设计首页" --platform web

    # 查询任务状态
    python generate_mockup.py status <task_id>

    # 获取结果图片路径
    python generate_mockup.py result <task_id>

    # 列出所有任务
    python generate_mockup.py list
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from contextlib import ExitStack
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve()

# 默认以当前工作目录作为项目根目录；可用 UI_GEN_PROJECT_ROOT 覆盖。
PROJECT_ROOT = Path(os.environ.get("UI_GEN_PROJECT_ROOT", Path.cwd())).expanduser().resolve()
TASK_DIR = Path(tempfile.gettempdir()) / "ui-generation-tasks"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
ASSET_PLATFORMS = {"asset", "element", "icon", "illustration", "png"}

DEFAULT_SYSTEM_CONTEXT = """你是一位资深 UI/UX 设计师和产品型前端工程师，正在为用户生成可落地的 UI 参考图。
请根据输入的产品背景、平台、风格和界面目标生成清晰、真实、专业的界面设计。

通用要求：
- 画面应像真实可用的软件界面，而不是抽象概念图或宣传海报。
- 信息架构清楚，主操作突出，次要信息有层级。
- 控件符合目标平台习惯，按钮、表单、表格、图表、导航、弹窗等要有明确状态。
- 文案使用指定语言；未指定时跟随用户 prompt 的语言。
- 保持可实施性，避免过度装饰、不可读小字、无意义渐变和堆叠元素。
- 若是后台/工具型产品，强调信息密度、可扫描性和高频操作效率。
- 若是移动端，考虑安全区、底部导航、拇指操作区和窄屏换行。
- 若是桌面端，考虑窗口布局、侧栏、工具栏、状态栏和密集工作流。
- 若是游戏 UI，考虑 HUD 层级、读数可见性、菜单状态和输入方式。
"""

TEXT_DENSITY_GUIDANCE = {
    "minimal": "文字密度：精简。保留主标题、模块名、状态标签和必要短说明；可以压缩长段落，但不要删除用户明确要求的规范项。",
    "balanced": "文字密度：均衡。保留标题、标签、状态说明、规范说明等信息层级；通过分块、留白、行距和高对比提升可读性。",
    "dense": "文字密度：较高。允许色彩规范、动效说明、适用场景、规格参数等详细文案，但必须分栏排版、控制行长，避免微缩和拥挤。",
}


def load_env() -> dict[str, str]:
    """从 .env 文件和环境变量加载配置。"""
    env_path = PROJECT_ROOT / ".env"
    env_vars: dict[str, str] = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env_vars[key.strip()] = value.strip().strip('"').strip("'")

    for key in (
        "OPENAI_API_BASE",
        "OPENAI_API_KEY",
        "OPENAI_IMAGE_MODEL",
        "OPENAI_UI_OUTPUT_DIR",
    ):
        value = os.environ.get(key)
        if value:
            env_vars[key] = value
    return env_vars


def resolve_project_path(value: str | None, default: str) -> Path:
    """把相对路径解析到项目根目录。"""
    raw_path = Path(value or default).expanduser()
    if raw_path.is_absolute():
        return raw_path
    return PROJECT_ROOT / raw_path


def read_text_file(path_value: str | None) -> str:
    if not path_value:
        return ""
    path = resolve_project_path(path_value, ".")
    if not path.exists():
        raise FileNotFoundError(f"上下文文件不存在: {path}")
    if not path.is_file():
        raise IsADirectoryError(f"上下文路径不是文件: {path}")
    return path.read_text(encoding="utf-8")


def resolve_reference_images(image_values: list[str] | None, dir_value: str | None) -> list[Path]:
    """解析参考图参数，支持重复 --reference-image 和 --reference-dir。"""
    paths: list[Path] = []

    for value in image_values or []:
        path = resolve_project_path(value, ".")
        if not path.exists():
            raise FileNotFoundError(f"参考图不存在: {path}")
        if not path.is_file():
            raise IsADirectoryError(f"参考图路径不是文件: {path}")
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            raise ValueError(f"参考图格式不支持: {path}，支持 {', '.join(sorted(IMAGE_SUFFIXES))}")
        paths.append(path)

    if dir_value:
        dir_path = resolve_project_path(dir_value, ".")
        if not dir_path.exists():
            raise FileNotFoundError(f"参考图目录不存在: {dir_path}")
        if not dir_path.is_dir():
            raise NotADirectoryError(f"参考图目录不是文件夹: {dir_path}")
        for path in sorted(dir_path.iterdir()):
            if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
                paths.append(path)

    # 去重但保持顺序。
    seen: set[Path] = set()
    unique_paths: list[Path] = []
    for path in paths:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique_paths.append(resolved)
    return unique_paths


def build_full_prompt(task: dict) -> str:
    """根据任务参数拼装最终图片生成 prompt。"""
    sections = [DEFAULT_SYSTEM_CONTEXT.strip()]

    platform = task.get("platform")
    if platform:
        sections.append(f"目标平台/界面类型：{platform}")

    audience = task.get("audience")
    if audience:
        sections.append(f"目标用户：{audience}")

    style = task.get("style")
    if style:
        sections.append(f"视觉风格：{style}")

    language = task.get("language")
    if language:
        sections.append(f"界面中文字语言：{language}")

    text_density = task.get("text_density") or "balanced"
    text_guidance = [
        "文字清晰度要求：",
        "- 中文是视觉稿中最容易出错的部分，请优先保证笔画正确、边缘清晰、可读性稳定。",
        "- 保留用户要求的细节文案和规范说明，例如色彩规范、动效说明、适用场景、组件示例、状态说明等；不要为了减少错字而把这些信息整体删除。",
        "- 中文采用常规黑体/无衬线字体、水平排版、深色高对比；避免毛笔字、花体字、过细字重、透视变形、旋转文字、发光描边和强烈纹理覆盖。",
        "- 详细中文请分块、分栏、增加行距和留白；避免把整段说明压成微缩字，也不要让文字贴边或叠在复杂背景上。",
        "- 如果某些非关键小字无法保证准确，可以用短横线或占位条表达层级；但标题、模块名、状态标签和用户明确要求的文案必须尽量清晰呈现。",
        TEXT_DENSITY_GUIDANCE.get(text_density, TEXT_DENSITY_GUIDANCE["balanced"]),
    ]
    exact_texts = task.get("exact_texts") or []
    if exact_texts:
        exact_lines = "\n".join(f"- {text}" for text in exact_texts)
        text_guidance.append(
            "必须逐字准确呈现的中文文案如下；只渲染这些原文，不要改写、增删、繁简混用或生成近似字：\n"
            f"{exact_lines}"
        )
    sections.append("\n".join(text_guidance))

    context = task.get("context")
    if context:
        sections.append(f"项目/品牌/设计约束：\n{context}")

    context_file_text = task.get("context_file_text")
    if context_file_text:
        sections.append(f"从上下文文件读取的补充信息：\n{context_file_text}")

    reference_images = task.get("reference_images") or []
    if reference_images:
        filenames = "\n".join(f"- {Path(path).name}" for path in reference_images)
        sections.append(
            "参考图使用要求：已随请求提供参考图片，请优先遵循参考图中的品牌色、纹理、IP 形象、构图节奏、图标风格和界面气质；"
            "不要机械复刻参考图文字内容，输出应服务于本次 UI 原型需求。\n"
            f"参考图文件：\n{filenames}"
        )

    sections.append(f"用户需求：\n{task['prompt']}")

    if str(platform or "").lower() in ASSET_PLATFORMS:
        sections.append(
            "请输出一张独立视觉素材图，不要生成 UI 页面、设计板、说明文字、边框或展示样机。严格遵循用户需求中的主体、纯色背景、构图和留白要求。"
        )
    else:
        sections.append(
            "请输出一张完整 UI 参考图。画面中需要包含足够真实的界面元素、内容占位、状态和层级，便于工程师反推实现。"
        )
    return "\n\n".join(sections)


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def log(message: str = "") -> None:
    if message:
        print(f"[{_now()}] {message}", flush=True)
    else:
        print("", flush=True)


# ---------------------------------------------------------------------------
# 任务管理
# ---------------------------------------------------------------------------


def _task_path(task_id: str) -> Path:
    return TASK_DIR / f"{task_id}.json"


def _log_path(task_id: str) -> Path:
    return TASK_DIR / f"{task_id}.log"


def _save_task(task_id: str, data: dict) -> None:
    TASK_DIR.mkdir(parents=True, exist_ok=True)
    _task_path(task_id).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_task(task_id: str) -> dict | None:
    path = _task_path(task_id)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _write_initial_log(log_path: Path, task: dict) -> None:
    """在后台进程启动前写入可立即看到的任务上下文。"""
    full_prompt = build_full_prompt(task)
    lines = [
        f"[{_now()}] 后台任务初始化...",
        f"[{_now()}] Task ID: {task['id']}",
        f"[{_now()}] 项目根目录: {PROJECT_ROOT}",
        f"[{_now()}] 输出目录: {resolve_project_path(task.get('output_dir'), 'docs/images/ui-generated')}",
        f"[{_now()}] 输出文件: {task.get('output') or '(自动命名)'}",
        f"[{_now()}] 图片尺寸: {task.get('size')}",
        f"[{_now()}] 指定模型: {task.get('model') or '(使用环境变量或默认模型)'}",
        f"[{_now()}] 平台: {task.get('platform') or '-'}",
        f"[{_now()}] 风格: {task.get('style') or '-'}",
        f"[{_now()}] 目标用户: {task.get('audience') or '-'}",
        f"[{_now()}] 语言: {task.get('language') or '-'}",
        f"[{_now()}] 文字密度: {task.get('text_density') or 'balanced'}",
        f"[{_now()}] 精确文案数量: {len(task.get('exact_texts') or [])}",
        f"[{_now()}] 参考图模式: {task.get('reference_mode')}",
        f"[{_now()}] 参考图数量: {len(task.get('reference_images') or [])}",
        f"[{_now()}] 遮罩图: {task.get('mask') or '-'}",
        "",
        "===== 用户原始提示词 =====",
        task.get("prompt") or "",
        "===== /用户原始提示词 =====",
        "",
        "===== 最终发送给图片模型的提示词 =====",
        full_prompt,
        "===== /最终发送给图片模型的提示词 =====",
        "",
    ]
    log_path.write_text("\n".join(lines), encoding="utf-8")


# ---------------------------------------------------------------------------
# 子命令: start
# ---------------------------------------------------------------------------


def cmd_start(args: argparse.Namespace) -> None:
    """启动后台图片生成任务。"""
    try:
        context_file_text = read_text_file(args.context_file)
        reference_images = resolve_reference_images(args.reference_image, args.reference_dir)
        mask_path = None
        if args.mask:
            mask = resolve_project_path(args.mask, ".")
            if not mask.exists():
                raise FileNotFoundError(f"遮罩图不存在: {mask}")
            if not mask.is_file():
                raise IsADirectoryError(f"遮罩图路径不是文件: {mask}")
            if mask.suffix.lower() not in IMAGE_SUFFIXES:
                raise ValueError(f"遮罩图格式不支持: {mask}，支持 {', '.join(sorted(IMAGE_SUFFIXES))}")
            mask_path = str(mask.resolve())
    except Exception as exc:
        print(f"错误: {exc}", file=sys.stderr)
        sys.exit(1)

    task_id = uuid.uuid4().hex[:12]
    now = _now()

    env = load_env()
    output_dir = args.output_dir or env.get("OPENAI_UI_OUTPUT_DIR") or "docs/images/ui-generated"

    task_meta = {
        "id": task_id,
        "status": "pending",
        "prompt": args.prompt,
        "platform": args.platform,
        "style": args.style,
        "audience": args.audience,
        "language": args.language,
        "text_density": args.text_density,
        "exact_texts": args.exact_text,
        "context": args.context,
        "context_file": args.context_file,
        "context_file_text": context_file_text,
        "reference_images": [str(path) for path in reference_images],
        "reference_dir": args.reference_dir,
        "reference_mode": args.reference_mode,
        "mask": mask_path,
        "size": args.size,
        "model": args.model,
        "output": args.output,
        "output_dir": output_dir,
        "created_at": now,
        "started_at": None,
        "finished_at": None,
        "image_path": None,
        "error": None,
        "warning": None,
        "generation_endpoint": None,
    }
    _save_task(task_id, task_meta)

    log_path = _log_path(task_id)
    _write_initial_log(log_path, task_meta)
    with open(log_path, "a", encoding="utf-8") as log_file:
        log_file.write(f"[{_now()}] 准备启动后台子进程...\n")
        log_file.flush()
        proc = subprocess.Popen(
            [
                sys.executable,
                "-u",
                str(SCRIPT_PATH),
                "_run",
                task_id,
            ],
            stdout=log_file,
            stderr=subprocess.STDOUT,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
            start_new_session=True,
        )
        log_file.write(f"[{_now()}] 后台子进程已启动，PID: {proc.pid}\n")
        log_file.flush()

    task_meta["pid"] = proc.pid
    task_meta["status"] = "running"
    task_meta["started_at"] = _now()
    _save_task(task_id, task_meta)

    print("任务已启动")
    print(f"  Task ID:  {task_id}")
    print(f"  PID:      {proc.pid}")
    print(f"  日志:     {log_path}")
    print(f"  输出目录: {resolve_project_path(output_dir, 'docs/images/ui-generated')}")
    if reference_images:
        print(f"  参考图:   {len(reference_images)} 张 ({args.reference_mode})")
    print(f"  查询状态: python {SCRIPT_PATH.name} status {task_id}")


def call_images_generate(client, image_model: str, full_prompt: str, size: str):
    return client.images.generate(
        model=image_model,
        prompt=full_prompt,
        size=size,
        n=1,
        response_format="b64_json",
    )


def call_images_edit(
    client,
    image_model: str,
    full_prompt: str,
    size: str,
    reference_paths: list[str],
    mask_path: str | None,
    first_image_only: bool = False,
):
    """调用 /v1/images/edits。兼容第三方接口：可退化为只传首张参考图。"""
    paths = reference_paths[:1] if first_image_only else reference_paths
    with ExitStack() as stack:
        image_files = [stack.enter_context(open(path, "rb")) for path in paths]
        image_arg = image_files[0] if len(image_files) == 1 else image_files
        kwargs = {
            "model": image_model,
            "image": image_arg,
            "prompt": full_prompt,
            "size": size,
            "n": 1,
            "response_format": "b64_json",
        }
        if mask_path:
            kwargs["mask"] = stack.enter_context(open(mask_path, "rb"))
        return client.images.edit(**kwargs)


# ---------------------------------------------------------------------------
# 内部子命令: _run
# ---------------------------------------------------------------------------


def cmd_run(args: argparse.Namespace) -> None:
    """后台执行图片生成，由 start 子进程调用。"""
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except AttributeError:
        pass

    task_id = args.task_id
    task = _load_task(task_id)
    if not task:
        print(f"错误: 任务 {task_id} 不存在", file=sys.stderr, flush=True)
        sys.exit(1)

    log("后台任务进入执行阶段。")

    try:
        from openai import OpenAI
    except ImportError:
        task["status"] = "failed"
        task["error"] = "需要 openai 库，请安装依赖: pip install openai"
        task["finished_at"] = _now()
        _save_task(task_id, task)
        log(task["error"])
        sys.exit(1)

    env = load_env()
    api_base = env.get("OPENAI_API_BASE", "https://api.openai.com/v1")
    api_key = env.get("OPENAI_API_KEY")
    image_model = task.get("model") or env.get("OPENAI_IMAGE_MODEL", "gpt-image-1")

    if not api_key:
        task["status"] = "failed"
        task["error"] = ".env 或环境变量中缺少 OPENAI_API_KEY"
        task["finished_at"] = _now()
        _save_task(task_id, task)
        log(task["error"])
        sys.exit(1)

    full_prompt = build_full_prompt(task)
    size = task.get("size", "1536x1024")
    reference_images = task.get("reference_images") or []
    reference_mode = task.get("reference_mode") or "auto"
    mask_path = task.get("mask")

    log("开始生成 UI 参考图...")
    log(f"模型: {image_model}")
    log(f"尺寸: {size}")
    log(f"API Base: {api_base}")
    log(f"参考图模式: {reference_mode}")
    if reference_images:
        log(f"参考图数量: {len(reference_images)}")
        for index, path in enumerate(reference_images, start=1):
            log(f"参考图 {index}: {path}")
    if mask_path:
        log(f"遮罩图: {mask_path}")
    log(f"Prompt 长度: {len(full_prompt)} 字符")

    start_time = time.time()
    log("初始化 OpenAI 兼容客户端...")
    client = OpenAI(base_url=api_base, api_key=api_key)
    log("客户端初始化完成。")

    if reference_mode == "edit" and not reference_images:
        task["status"] = "failed"
        task["error"] = "reference-mode=edit 需要至少提供一张 --reference-image 或 --reference-dir"
        task["finished_at"] = _now()
        _save_task(task_id, task)
        log(task["error"])
        sys.exit(1)

    warning = None
    try:
        if reference_images and reference_mode in {"auto", "edit"}:
            try:
                log("调用 /v1/images/edits 生成参考图约束 UI...")
                response = call_images_edit(client, image_model, full_prompt, size, reference_images, mask_path)
                task["generation_endpoint"] = "images.edit"
            except Exception as exc:
                if len(reference_images) > 1:
                    try:
                        log(f"多参考图调用失败，尝试仅使用首张参考图: {exc}")
                        response = call_images_edit(
                            client,
                            image_model,
                            full_prompt,
                            size,
                            reference_images,
                            mask_path,
                            first_image_only=True,
                        )
                        task["generation_endpoint"] = "images.edit:first-image"
                        warning = f"多参考图调用失败，已降级为仅使用首张参考图: {exc}"
                    except Exception as first_exc:
                        if reference_mode == "edit":
                            raise
                        log(f"参考图 edit 调用失败，降级为纯文本生成: {first_exc}")
                        response = call_images_generate(client, image_model, full_prompt, size)
                        task["generation_endpoint"] = "images.generate:fallback"
                        warning = f"参考图 edit 调用失败，已降级为纯文本生成: {first_exc}"
                elif reference_mode == "edit":
                    raise
                else:
                    log(f"参考图 edit 调用失败，降级为纯文本生成: {exc}")
                    response = call_images_generate(client, image_model, full_prompt, size)
                    task["generation_endpoint"] = "images.generate:fallback"
                    warning = f"参考图 edit 调用失败，已降级为纯文本生成: {exc}"
        else:
            log("调用 /v1/images/generations 生成 UI...")
            response = call_images_generate(client, image_model, full_prompt, size)
            task["generation_endpoint"] = "images.generate"
    except Exception as exc:
        task["status"] = "failed"
        task["error"] = f"图片生成接口调用失败: {exc}"
        task["finished_at"] = _now()
        _save_task(task_id, task)
        log(task["error"])
        sys.exit(1)

    elapsed = time.time() - start_time
    log(f"API 调用完成，耗时 {elapsed:.1f}s")

    output_dir = resolve_project_path(task.get("output_dir"), "docs/images/ui-generated")
    log(f"准备写入输出目录: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    image_data = response.data[0]
    filename = task.get("output") or f"ui-{timestamp}.png"
    output_path = output_dir / filename

    if hasattr(image_data, "b64_json") and image_data.b64_json:
        log("API 返回 b64_json，开始解码图片...")
        img_bytes = base64.b64decode(image_data.b64_json)
        output_path.write_bytes(img_bytes)
    elif hasattr(image_data, "url") and image_data.url:
        import urllib.request

        log("API 返回图片 URL，开始下载图片...")
        req = urllib.request.Request(image_data.url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp, open(output_path, "wb") as output_file:
            output_file.write(resp.read())
    else:
        task["status"] = "failed"
        task["error"] = "API 返回格式不支持，无 b64_json 或 url"
        task["finished_at"] = _now()
        _save_task(task_id, task)
        log(task["error"])
        sys.exit(1)

    task["status"] = "completed"
    task["image_path"] = str(output_path)
    task["elapsed_seconds"] = round(elapsed, 1)
    task["finished_at"] = _now()
    task["warning"] = warning
    task.pop("context_file_text", None)
    _save_task(task_id, task)
    log(f"已保存: {output_path}")
    if warning:
        log(f"警告: {warning}")


# ---------------------------------------------------------------------------
# 子命令: status
# ---------------------------------------------------------------------------


def cmd_status(args: argparse.Namespace) -> None:
    """查询任务状态。"""
    task = _load_task(args.task_id)
    if not task:
        print(f"任务 {args.task_id} 不存在")
        return

    status_map = {
        "pending": "等待中",
        "running": "生成中",
        "completed": "已完成",
        "failed": "失败",
    }
    print(f"Task ID:    {task['id']}")
    print(f"状态:       {status_map.get(task['status'], task['status'])}")
    print(f"创建时间:   {task.get('created_at', '-')}")
    if task.get("started_at"):
        print(f"开始时间:   {task['started_at']}")
    if task.get("finished_at"):
        print(f"完成时间:   {task['finished_at']}")
    if task.get("elapsed_seconds"):
        print(f"耗时:       {task['elapsed_seconds']}s")
    if task.get("image_path"):
        print(f"图片路径:   {task['image_path']}")
    if task.get("generation_endpoint"):
        print(f"生成接口:   {task['generation_endpoint']}")
    if task.get("warning"):
        print(f"警告:       {task['warning']}")
    if task.get("error"):
        print(f"错误:       {task['error']}")
    if task.get("pid") and task["status"] == "running":
        print(f"PID:        {task['pid']}")
        print(f"日志:       {_log_path(task['id'])}")


# ---------------------------------------------------------------------------
# 子命令: result
# ---------------------------------------------------------------------------


def cmd_result(args: argparse.Namespace) -> None:
    """获取任务结果，仅输出图片路径，便于脚本调用。"""
    task = _load_task(args.task_id)
    if not task:
        print(f"任务 {args.task_id} 不存在", file=sys.stderr)
        sys.exit(1)
    if task["status"] == "completed" and task.get("image_path"):
        print(task["image_path"])
    elif task["status"] == "failed":
        print(f"任务失败: {task.get('error', '未知错误')}", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"任务尚未完成 (状态: {task['status']})", file=sys.stderr)
        sys.exit(2)


# ---------------------------------------------------------------------------
# 子命令: list
# ---------------------------------------------------------------------------


def cmd_list(args: argparse.Namespace) -> None:
    """列出所有任务。"""
    TASK_DIR.mkdir(parents=True, exist_ok=True)
    tasks = []
    for path in sorted(TASK_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            tasks.append(data)
        except Exception:
            continue

    if not tasks:
        print("暂无任务记录")
        return

    print(f"{'ID':<14} {'状态':<8} {'创建时间':<20} {'耗时':<8} {'输出文件'}")
    print("-" * 80)
    for task in tasks:
        elapsed = f"{task.get('elapsed_seconds', '-')}s" if task.get("elapsed_seconds") else "-"
        output = Path(task["image_path"]).name if task.get("image_path") else "-"
        print(
            f"{task['id']:<14} {task.get('status', '-'):<8} "
            f"{task.get('created_at', '-'):<20} {elapsed:<8} {output}"
        )


# ---------------------------------------------------------------------------
# CLI 入口
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="通用 UI 参考图异步生成器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subs = parser.add_subparsers(dest="command", help="可用命令")

    p_start = subs.add_parser("start", help="启动后台生成任务")
    p_start.add_argument("--prompt", required=True, help="UI 需求描述")
    p_start.add_argument("--size", default="1536x1024", help="图片尺寸，默认 1536x1024")
    p_start.add_argument("--output", default=None, help="自定义输出文件名，不含路径")
    p_start.add_argument("--output-dir", default=None, help="自定义输出目录，默认 docs/images/ui-generated")
    p_start.add_argument("--model", default=None, help="覆盖 .env 中的 OPENAI_IMAGE_MODEL")
    p_start.add_argument(
        "--platform",
        default=None,
        help="目标平台或输出类型，例如 web、mobile、desktop、tablet、game、component、asset、element",
    )
    p_start.add_argument("--style", default=None, help="视觉风格描述")
    p_start.add_argument("--audience", default=None, help="目标用户")
    p_start.add_argument("--language", default=None, help="界面中文字语言，例如 zh、en")
    p_start.add_argument(
        "--text-density",
        choices=("minimal", "balanced", "dense"),
        default="balanced",
        help="图中文字密度：minimal 精简但保留必要规范；balanced 默认均衡；dense 允许更多文字但强化分块、行距和留白",
    )
    p_start.add_argument(
        "--exact-text",
        action="append",
        default=[],
        help="必须逐字准确呈现的文案，可重复传入；适合品牌名、按钮名、状态标签等关键中文",
    )
    p_start.add_argument("--context", default=None, help="项目、品牌或设计约束文本")
    p_start.add_argument("--context-file", default=None, help="从文件读取额外上下文")
    p_start.add_argument(
        "--reference-image",
        action="append",
        default=[],
        help="参考图路径，可重复传多张；存在参考图时 auto/edit 模式会优先调用 /v1/images/edits",
    )
    p_start.add_argument("--reference-dir", default=None, help="参考图目录，自动读取其中 png/jpg/jpeg/webp")
    p_start.add_argument(
        "--reference-mode",
        choices=("auto", "edit", "generate"),
        default="auto",
        help="参考图处理模式：auto 优先 edits 失败降级；edit 强制 edits；generate 忽略参考图走纯文本生成",
    )
    p_start.add_argument("--mask", default=None, help="遮罩图路径，仅在 images.edit 模式下使用")

    p_run = subs.add_parser("_run", help=argparse.SUPPRESS)
    p_run.add_argument("task_id", help="任务 ID")

    p_status = subs.add_parser("status", help="查询任务状态")
    p_status.add_argument("task_id", help="任务 ID")

    p_result = subs.add_parser("result", help="获取结果图片路径")
    p_result.add_argument("task_id", help="任务 ID")

    subs.add_parser("list", help="列出所有任务")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    dispatch = {
        "start": cmd_start,
        "_run": cmd_run,
        "status": cmd_status,
        "result": cmd_result,
        "list": cmd_list,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
