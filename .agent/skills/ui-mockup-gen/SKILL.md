---
name: ui-mockup-gen
description: 通用视觉素材生成技能包。通过 OpenAI 兼容图像 API 生成 UI 原型图、界面参考图、设计板、纯色背景视觉元素和连贯动画序列，并将结果处理为透明 PNG、单帧序列、spritesheet 与循环动画预览。用户要求生成 UI、界面设计、原型图、透明 PNG、免抠素材、图标、插画、网页图片元素、角色动作、序列帧、动画素材或循环动画时使用。
---

# UI Mockup Gen

面向前端全栈开发的模块化视觉素材技能包。当前已提供 UI 原型图生成、透明 PNG 元素生成和动画素材生成能力；后续新增视觉素材能力时，继续以独立模块接入。

## 脚本运行环境

运行 `scripts/` 下的 Python 脚本前，必须在项目根目录创建或复用 `.venv` 虚拟环境，并按对应模块安装依赖。统一使用 `.venv/bin/python` 执行脚本，不要安装到系统 Python；Windows 使用 `.venv\Scripts\python.exe`。

```bash
python3 -m venv .venv
.venv/bin/python -m pip install openai Pillow
.venv/bin/python .agent/skills/ui-mockup-gen/scripts/<script>.py --help
```

## 模块索引

执行任何具体能力前，必须先读取对应的完整模块文档。模块的使用方法、命令、实施流程和排障说明只保存在模块文档内。

- UI 原型图、界面参考图和设计板生成：读取 `references/ui-prototype-generation.md`
- 纯色背景视觉元素生成和透明 PNG 抠图：读取 `references/transparent-png-elements.md`
- 连贯动画帧、spritesheet 和循环预览生成：读取 `references/animated-assets.md`
