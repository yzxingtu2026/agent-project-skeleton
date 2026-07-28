# 动画素材生成

本模块将透明视觉元素处理为稳定、可循环、可直接交付前端的 PNG 帧、spritesheet、WebP 和 manifest。

执行前必须完整读取 `references/transparent-png-elements.md`。纯色背景选择、抠图和边缘验收继续遵循该模块。

## 目录

- 核心原则
- 动画类型路由
- 输出契约
- 锚点和分层协议
- 工作流 A：确定性分层动画
- 工作流 B：模型状态帧动画
- Prompt 规则
- 质量门禁
- 前端使用
- 排障与降级

## 核心原则

模型负责画出视觉状态，脚本负责控制空间运动，锚点协议负责保持稳定，质量门禁负责拒绝不可用结果。

不要要求图像模型精确控制像素级位移、缩放或旋转。提示词是软约束，不能替代脚本校验。不要用整帧 Alpha 质心对齐包含波纹、阴影、光环或粒子的素材，这些特效变化会改变质心。

## 动画类型路由

生成前先分类，并在任务记录中说明选择：

| 类型 | 示例 | 默认工作流 |
|---|---|---|
| 几何变换型 | 悬浮、呼吸、缩放、摇摆、轻震、光环收放 | 单张或分层透明素材，通过 `compose_animation_assets.py` 确定性生成 |
| 局部状态型 | 眨眼、表情、叶片摆动、灯光切换 | 模型生成固定位置的状态帧，通过 `build_animation_assets.py` 归一化，再施加运动计划 |
| 复杂动作型 | 行走、转身、挥手、跳跃 | 模型生成序列，使用稳定主体区域归一化并严格验收；漂移或形变超限时重新生成或转专业动画工具 |

只要动作能够用位移、缩放、旋转和透明度表达，就优先走确定性分层动画。不要让模型重复绘制完整主体。

## 输出契约

每组动画至少交付：

- `frames/<name>-000.png` 等等宽等高透明帧
- `<name>-spritesheet.png`：按播放顺序横向排列
- `<name>-preview.webp`：无限循环透明预览
- `<name>-manifest.json`：帧尺寸、时长、锚点、运动或图层状态

模型状态帧还要保留原始纯色网格和统一抠图后的透明网格。Manifest 版本为 `2`。

## 锚点和分层协议

### 锚点

按素材语义选择锚点：

- `center`：图标、徽章、中心光效
- `bottom-center`：站立角色、悬浮物体
- `top-center`：吊挂物体
- 自定义 `{ "x": 0.5, "y": 0.85 }`：锚点使用图层图片的归一化坐标

模型网格的稳定区域使用 `--anchor-region x,y,width,height` 指定，范围均为 `0–1`。稳定区域只包含应保持尺寸一致的主体，排除波纹、阴影、光环、粒子以及明确变化的肢体。

### 分层

存在独立运动时必须拆层：

- `subject`：角色或主要物体
- `attachment`：叶片、头发、手臂等局部部件
- `ground-effect`：波纹、阴影
- `free-effect`：粒子、光点

每层使用独立透明 PNG、锚点、目标位置和运动状态。无法可靠自动分离的重叠素材，应在生成阶段分别生成各层，或提供明确遮罩；不要用颜色或整帧质心猜测语义层。

## 工作流 A：确定性分层动画

适用于悬浮、呼吸和图标动效。准备一个场景 JSON：

```json
{
  "version": 1,
  "name": "character-idle",
  "output_dir": "./character-idle-animation",
  "canvas": { "width": 320, "height": 360 },
  "frame_count": 8,
  "fps": 10,
  "layers": [
    {
      "id": "ground-effect",
      "file": "./character-ripple.png",
      "anchor": "center",
      "position": { "x": 160, "y": 320 },
      "frames": [
        { "scale_x": 1.00, "opacity": 0.85 },
        { "scale_x": 1.04, "opacity": 0.75 },
        { "scale_x": 1.08, "opacity": 0.65 },
        { "scale_x": 1.04, "opacity": 0.75 },
        { "scale_x": 1.00, "opacity": 0.85 },
        { "scale_x": 0.96, "opacity": 0.92 },
        { "scale_x": 0.92, "opacity": 1.00 },
        { "scale_x": 0.96, "opacity": 0.92 }
      ]
    },
    {
      "id": "subject",
      "file": "./character.png",
      "anchor": "bottom-center",
      "position": { "x": 160, "y": 312 },
      "frames": [
        { "y": 0 }, { "y": -2 }, { "y": -4 }, { "y": -2 },
        { "y": 0 }, { "y": 2 }, { "y": 4 }, { "y": 2 }
      ]
    }
  ]
}
```

每层支持：

- `x`、`y`：相对目标位置的像素位移
- `scale` 或 `scale_x`、`scale_y`
- `rotation`：角度，正值顺时针
- `opacity`：`0–1`

图层不需要变化时省略 `frames`；提供 `frames` 时，其数量必须与场景的 `frame_count` 完全一致。

执行：

```bash
python .agent/skills/ui-mockup-gen/scripts/compose_animation_assets.py \
  character-idle-scene.json \
  --json
```

脚本使用锚点仿射变换直接渲染到固定画布，不做逐帧裁切。任何帧为空、尺寸不一致或内容触边时拒绝输出。

## 工作流 B：模型状态帧动画

### 1. 规划状态和运动

默认使用 `6–8` 帧、`8–12 FPS`。周期序列不要复制首帧作为尾帧。

将视觉状态和空间运动分开：

- Prompt 只描述表情、姿态和局部形变。
- 运动计划 JSON 只描述归一化后的确定性 `x/y` 位移。

运动计划示例：

```json
{
  "frames": [
    { "x": 0, "y": 0 },
    { "x": 0, "y": -2 },
    { "x": 0, "y": -4 },
    { "x": 0, "y": -2 },
    { "x": 0, "y": 0 },
    { "x": 0, "y": 2 },
    { "x": 0, "y": 4 },
    { "x": 0, "y": 2 }
  ]
}
```

### 2. 生成纯色网格

使用 `generate_mockup.py` 一次生成完整等分网格。默认 `4×2`，从左到右、从上到下播放。所有格使用相同纯色背景，无分隔线、文字、序号和标签。

```bash
python .agent/skills/ui-mockup-gen/scripts/generate_mockup.py start \
  --prompt "<动画状态帧 Prompt>" \
  --platform asset \
  --reference-image character.png \
  --reference-mode auto \
  --size 1536x1024 \
  --text-density minimal \
  --output character-state-grid-solid-bg.png
```

### 3. 整图抠图

```bash
python .agent/skills/ui-mockup-gen/scripts/remove_solid_background.py \
  character-state-grid-solid-bg.png \
  --output character-state-grid.png
```

不要使用 `--crop`，否则会破坏等分网格。

### 4. 锚点归一化和构建

```bash
python .agent/skills/ui-mockup-gen/scripts/build_animation_assets.py \
  character-state-grid.png \
  --rows 2 \
  --columns 4 \
  --frame-count 8 \
  --fps 10 \
  --name character-state \
  --output-dir character-state-animation \
  --stabilize-anchor bottom-center \
  --anchor-region 0.15,0.08,0.70,0.72 \
  --motion-plan character-state-motion.json \
  --max-anchor-error 1 \
  --max-scale-deviation 0.08 \
  --trim \
  --padding 16 \
  --json
```

归一化使用所有帧锚点的中位数，先清除模型生成的随机位移，再施加运动计划。`--allow-scale-drift` 只能用于明确允许主体缩放的动画，不得用于绕过角色重绘漂移。

## Prompt 规则

模型状态帧 Prompt 必须说明：

- 这是动画状态网格，不是角色设定板、UI 或多角色展示。
- 所有格为同一角色、镜头、比例、材质和光照。
- 主体始终固定在单元格中心和同一基线。
- 不通过移动、缩放或旋转整个主体表达动画。
- 只改变逐帧状态表指定的表情、姿态或局部部件。
- 所有空间位移由后处理脚本完成。
- 网格无可见分隔线、文字、序号和标签。
- 每格背景为完全相同的指定纯色，主体和特效不触边。

不要在 Prompt 中同时要求模型“保持固定位置”和“向上移动 4 像素”。后者属于运动计划。

## 质量门禁

必须同时满足：

1. 每帧为 RGBA PNG，尺寸完全一致。
2. 内容不接触画布边界，不跨单元格。
3. 归一化后锚点误差默认不超过 `1px`。
4. 稳定主体区域宽高偏差默认不超过 `8%`。
5. 非设计水平位移不超过 `1px`。
6. 角色身份、材质、视角和光照一致。
7. 最后一帧到第一帧没有额外停顿或异常跳变。
8. 深色、浅色和项目背景下无彩边、Alpha 孔洞。
9. Manifest、spritesheet 和实际帧数、尺寸、时长一致。

质量门禁失败时停止交付。不要通过扩大画布、降低 Alpha 阈值或启用 `--allow-scale-drift` 掩盖角色重绘问题。

## 前端使用

- 仅需循环播放时优先使用 WebP。
- 需要播放控制或状态机时使用 spritesheet 和 manifest。
- 预加载单个 WebP 或 spritesheet，不要运行时逐帧请求 PNG。
- 使用 manifest 的帧尺寸和时长，不在前端重新推断。
- 页面缩放保持等比，锚点计算使用整数像素或稳定的设备像素策略。

## 排障与降级

- 几何动画发生漂移：改用确定性分层工作流，不重新生成完整主体。
- 模型状态帧位置漂移：使用稳定主体区域归一化，不用整帧质心。
- 稳定主体尺寸超限：重新生成；这通常是角色被重绘，而不是位置问题。
- 主体与地面特效需要独立运动：拆成独立透明图层后合成。
- 素材重叠且无法可靠分层：重新分别生成图层或提供遮罩。
- 局部动作被锚点区域影响：缩小 `--anchor-region`，只保留不应变化的区域。
- 循环接缝跳变：重做周期运动计划，不复制首帧。
- 复杂动作持续无法保持身份：减少动作幅度、拆分短状态，或改用骨骼/专业动画工具。
