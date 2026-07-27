# 透明 PNG 元素生成

本模块负责生成纯色背景的独立视觉元素，再通过确定性抠图脚本输出可直接用于网页或应用的透明 PNG。

## 目录

- 适用范围
- 完整工作流
- 纯色背景生成规范
- 图像生成命令
- 抠图命令
- 参数选择
- 质量验证
- 排障与降级

## 适用范围

- 网页和应用中的装饰插画、空状态插画、功能入口图和运营图片元素
- 独立物体、产品、角色、徽章、贴纸和非标准图标
- 需要透明背景的单张 PNG 素材

不要用本模块生成已有图标库能够提供的通用操作图标。按钮、表单、表格等结构化 UI 控件应由前端代码和组件库实现。

## 完整工作流

1. 检查当前项目的品牌、配色、目标尺寸、使用位置和参考图。
2. 选择不会出现在主体中的高对比纯色背景。
3. 使用现有 `generate_mockup.py` 生成纯色背景素材。
4. 查询异步任务，取得原始图片绝对路径。
5. 使用 `remove_solid_background.py` 输出透明 PNG。
6. 检查透明通道、边缘、裁切、实际尺寸和深浅背景下的显示效果。
7. 保留原始纯色背景图，透明 PNG 使用不同文件名，不覆盖源文件。

## 纯色背景生成规范

### 背景色选择

- 优先使用主体中完全不会出现的高饱和色，例如亮绿色 `#00FF00` 或洋红色 `#FF00FF`。
- 主体含绿色时改用洋红色；主体含洋红、红紫色时改用亮绿色或另一种互补色。
- 避免白色，因为高光、白色服装和浅色物体容易被误删。
- 避免黑色，因为阴影、描边、头发和深色物体容易被误删。
- 同一批素材保持相同背景色和生成参数。

### Prompt 必须包含

- 这是独立素材，不是 UI 页面、设计板、样机、海报或场景图。
- 画布从边到边只有一种精确纯色背景，无渐变、纹理、噪点、光晕和地平线。
- 主体完整、居中，与画布四边保留至少 10% 至 15% 空白，不接触边缘。
- 不生成地面、投影、环境阴影、背景道具、边框和说明文字。
- 主体轮廓清楚；半透明、毛发、烟雾和强烈运动模糊只在确有必要时使用。
- 一张图片默认只生成一个元素。需要一组素材时分别生成，保证每张图可以独立抠图和使用。

推荐 Prompt 模板：

```text
生成一个可用于网页的独立视觉元素：[主体和风格描述]。
这是一张素材图，不是 UI 页面、设计板、海报、样机或场景图。
背景必须从画布边缘到边缘保持精确纯色 [#00FF00]，无渐变、无纹理、无噪点、无光晕、无地平线。
只保留一个完整主体，主体居中，四周至少保留 12% 纯色空白，不接触画布边缘。
不要地面、投影、环境阴影、背景物体、边框、标签、标题或任何文字。
主体边缘清晰，适合后续色键抠图并导出透明 PNG。
```

## 图像生成命令

继续使用现有异步生成器：

```bash
python .agent/skills/ui-mockup-gen/scripts/generate_mockup.py start \
  --prompt "<按本模块规范构造的素材 Prompt>" \
  --platform asset \
  --style "<项目视觉风格>" \
  --text-density minimal \
  --output element-solid-bg.png
```

使用参考图保持品牌或角色一致性：

```bash
python .agent/skills/ui-mockup-gen/scripts/generate_mockup.py start \
  --prompt "<素材 Prompt>" \
  --platform asset \
  --reference-image docs/brand/reference.png \
  --reference-mode auto \
  --output element-solid-bg.png
```

任务查询：

```bash
python .agent/skills/ui-mockup-gen/scripts/generate_mockup.py status <task_id>
python .agent/skills/ui-mockup-gen/scripts/generate_mockup.py result <task_id>
```

遵循有限轮询策略。任务仍为 `pending` 或 `running` 时保留 `task_id`，不要终止或重新创建任务。

## 抠图命令

脚本依赖 Pillow：

```bash
python -m pip install Pillow
```

自动从四角估算背景色并输出透明 PNG：

```bash
python .agent/skills/ui-mockup-gen/scripts/remove_solid_background.py \
  docs/images/ui-generated/element-solid-bg.png
```

明确指定背景色并自动裁边：

```bash
python .agent/skills/ui-mockup-gen/scripts/remove_solid_background.py \
  docs/images/ui-generated/element-solid-bg.png \
  --background '#00FF00' \
  --tolerance 28 \
  --feather 160 \
  --island-feather 100 \
  --edge-contract 2 \
  --blur-radius 0.8 \
  --decontaminate-radius 6 \
  --crop \
  --padding 8 \
  --output docs/images/ui-generated/element.png
```

默认输出为源文件同目录下的 `<源文件名>-transparent.png`，不会覆盖源文件。

## 参数选择

- `--background auto|#RRGGBB|R,G,B`：默认 `auto`，从四角区域估算背景色；已知 Prompt 背景色时优先显式传入。
- `--tolerance`：高置信度背景的色差范围，默认 `28`。背景噪点较多时逐步提高；主体被误删时降低。
- `--feather`：背景边缘的颜色羽化范围，默认 `160`。连通扩散另有内部上限，不会因为提高羽化范围而沿深色结构侵入主体内部。
- `--island-feather`：对色相仍接近背景、但被光晕或半透明效果包围的封闭背景岛增加额外羽化范围，默认 `100`。复杂光效内部残留背景色时提高；主体包含接近背景色的半透明材质时降低或设为 `0`。
- `--edge-contract`：背景遮罩向主体内收缩的像素数，默认 `2`，用于移除模型生成图边缘的背景混色。细线被侵蚀时改为 `1` 或 `0`。
- `--blur-radius`：Alpha 遮罩的高斯模糊半径，默认 `0.8`。锯齿明显时适当提高；轮廓发虚时降低。
- `--decontaminate-radius`：从主体内部确定前景区域向边缘延展颜色的搜索半径，默认 `6`，用于去除绿色、洋红色等背景溢色。细小结构颜色断裂时降低。
- `--crop`：按非透明区域裁切画布。
- `--padding`：裁切后保留的透明边距，默认 `0`。
- `--no-decontaminate`：关闭基于邻近确定前景颜色的边缘去污。默认开启，用于减少绿色或洋红色边缘。
- `--json`：输出结构化结果，便于其他脚本消费。

纯色背景与主体颜色接近时，不要一味提高容差。应重新生成一个背景色差更大的源图。

## 质量验证

每个结果至少完成以下检查：

1. 文件格式为 PNG，颜色模式包含 Alpha 通道。
2. 四角 Alpha 为 `0`，主体内部的主要区域 Alpha 为 `255`。
3. 在白色、黑色和项目实际背景上查看，没有明显彩边、锯齿或白边。
4. 主体没有缺角、孔洞、半透明污染或被裁切。
5. `--crop` 结果仍保留要求的透明 padding。
6. 页面使用尺寸下轮廓清楚，不依赖超大原图掩盖边缘问题。

不得只看透明棋盘格缩略图就判定合格。必要时生成白底和深色底预览进行视觉检查。

## 排障与降级

- 四角背景色不一致：源图不是纯色背景，优先重新生成；也可显式指定 `--background`，但渐变和复杂光影无法可靠色键抠图。
- 主体颜色被抠除：换用主体中不存在的背景色重新生成，或降低 `--tolerance`。
- 边缘残留背景色：保持去污开启，先将 `--edge-contract` 调为 `2`，再适当提高 `--feather`；仍不理想时重新生成边缘更清晰、无阴影的源图。
- 光环、波纹内部残留封闭背景色：适当提高 `--island-feather`；同时在深浅背景检查特效本身是否被削弱。
- 毛发、烟雾、玻璃或半透明物体效果差：纯色色键不是精细语义抠图；需要专用分割模型或人工遮罩时明确告知用户，不伪装成高质量结果。
- 缺少 Pillow：安装依赖后重试；不得在脚本中静默跳过抠图。
- 完全没有检测到主体：停止并检查背景色、容差和源图片，不输出误导性的空白素材。
