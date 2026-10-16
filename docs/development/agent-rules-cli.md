# Agent Rules CLI

`agent-rules` 把仓库根 `.agents/` 元结构统一收敛为跨工具通用入口 `AGENTS.md`。规则与技能只维护在 `.agents/` 一处，各 AI 编程工具直接读取，不再手工维护或生成多套厂商专属目录。

## 源结构

- `.agents/rules/`：通用规则源。
- `.agents/skills/`：通用技能源，首批包含 `qa-assist`。
- `.agents/templates/AGENTS.md.tpl`：本地入口 `AGENTS.md` 模板。

## 命令

```bash
npx -y @yz-xingtu/agent-rules@latest init
npx -y @yz-xingtu/agent-rules@latest sync
npx -y @yz-xingtu/agent-rules@latest doctor
npx -y @yz-xingtu/agent-rules@latest status --json
npx -y @yz-xingtu/agent-rules@latest ensure --non-interactive --json
```

`init` 生成仓库根唯一的跨工具入口 `AGENTS.md`，并配置本仓库 Git author。`sync` 按 `.agents/` 源刷新 `AGENTS.md`，仅在内容变化时写入。`doctor` 校验 `AGENTS.md` 是否与源一致，会同时报告 `missing`（缺失）与 `outdated`（过期）。

## 生成模型

本工具只有一个生成物：仓库根的 `AGENTS.md`（依赖操作者身份，已被 Git 忽略）。它由 `.agents/templates/AGENTS.md.tpl` 与操作者身份渲染而来，并指向 `.agents/` 下的规则与技能源。不再生成 `CLAUDE.md`、`.cursor/`、`.qoder/`、`.codex/`、`.claude/` 等厂商专属文件，也不再需要 `--agents` / `--target` 目标参数（传入会被忽略，便于旧脚本平滑过渡）。

## 面向自动化 Agent 的接口

### status

```bash
agent-rules status --json
```

只读地汇总：仓库规则源是否存在、操作者身份解析与缺失字段、`AGENTS.md` 的 `missing` / `outdated` / `current` 状态，以及推荐的下一步动作 `nextAction`（`init` / `sync` / `none`）。

### ensure（幂等入口）

```bash
agent-rules ensure --non-interactive --json
```

一次调用即可确保规则环境可用且最新：未初始化则 `init`，过期则 `sync`，已最新则不改动文件，最后执行一致性检查。重复运行不产生无意义变更（第二次 `actions` 与 `changedFiles` 为空，`status=current`）。

### 非交互 init

```bash
agent-rules init --non-interactive \
  --name="张三" --github-user=zhangsan --github-email=zhangsan@users.noreply.github.com --json
```

非交互模式不读取 stdin。操作者身份按优先级解析：**显式参数 > 本地 Git 配置 > `gh` 当前登录身份**。信息不足时返回结构化错误（`code=config_incomplete`），列出缺失字段与对应参数，不静默猜测或写入错误身份。离线 / CI 环境可设 `AGENT_RULES_NO_GH=1` 禁用 `gh` 探测，保证行为可确定。

### JSON 输出与退出码

- `--json` 时 **stdout 只输出最终 JSON**，人类可读进度改走 stderr；字段结构带 `schemaVersion`（当前 `2.0`）与 `cliVersion`。
- JSON 顶层字段：`command`、`status`、`repoRoot`、`sourcesPresent`、`operator`、`artifacts`、`nextAction`，以及 `ensure`/`sync` 的 `actions`、`changedFiles`、`check`，错误时的 `errors`。（`2.0` 起移除厂商扇出相关的 `targets`、`targetStatus` 字段。）
- 稳定退出码：

| 退出码 | 含义 | 对应 `status` |
| --- | --- | --- |
| `0` | 成功（含“已变更”与“无需变更”） | `ok` / `changed` / `current` |
| `1` | 未预期错误（如缺少 `.agents` 工作区） | `error` |
| `2` | 配置或操作者身份不完整 | `config_incomplete` |
| `3` | 源校验失败或生成物一致性检查未通过 | `check_failed` |

- 路径、中文身份与 UTF-8 输出在 Windows / macOS / Linux 表现一致。

## 本地开发

```bash
node .agents/tools/agent-rules/cli.js <命令>
cd .agents/tools/agent-rules && npm run check && npm test
```

`npm run check` 对 `cli.js` 与 `src/*.js` 做跨平台语法检查；`npm test` 使用 Node 内置 `node:test` 运行 `test/` 下的自动化测试（覆盖幂等、身份缺失、doctor 退出码、JSON 纯净度等）。

## 维护原则

- 修改规则时先改 `.agents/rules/`，再运行 `sync`。
- 修改技能时先改 `.agents/skills/`。
- 首次使用或更换操作者时运行 `init`，生成本地 `AGENTS.md` 并配置本仓库 Git author；规则更新后运行 `sync` 刷新入口文件。
- `AGENTS.md` 是本地生成物，已加入 `.gitignore`，不要提交到仓库。
- 生成文件顶部带中文生成标记。
- `doctor` 用于本地 `sync` 后校验 `AGENTS.md` 是否与源一致。
