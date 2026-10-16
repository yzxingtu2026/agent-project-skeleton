# @yz-xingtu/agent-rules

把仓库根 `.agents/` 元结构统一收敛为跨工具通用入口 `AGENTS.md`。规则与技能只维护在 `.agents/` 一处，各 AI 编程工具直接读取，不再扇出多套厂商专属目录。

## 使用方式

在项目仓库根目录运行：

```bash
npx -y @yz-xingtu/agent-rules@latest init
npx -y @yz-xingtu/agent-rules@latest sync
npx -y @yz-xingtu/agent-rules@latest doctor
npx -y @yz-xingtu/agent-rules@latest status --json
npx -y @yz-xingtu/agent-rules@latest ensure --non-interactive --json
```

如果已经全局安装，也可以直接使用 `agent-rules`：

```bash
npm install -g @yz-xingtu/agent-rules
agent-rules init
```

## 命令

### init

初始化当前使用者并生成本地入口：

```bash
npx -y @yz-xingtu/agent-rules@latest init
```

`init` 会生成仓库根唯一的跨工具入口 `AGENTS.md`（含操作者身份，已被 Git 忽略），同时配置当前仓库的 `git user.name`、`user.email` 和 `github.user`。已存在 `AGENTS.md` 时需加 `--force` 才会覆盖。

### sync

从 `.agents/` 源结构刷新 `AGENTS.md`：

```bash
npx -y @yz-xingtu/agent-rules@latest sync
```

仅当内容有变化时才写入，重复运行不产生无意义变更。

### doctor

检查当前 `AGENTS.md` 是否与 `.agents/` 源结构一致：

```bash
npx -y @yz-xingtu/agent-rules@latest doctor
```

`doctor` 会同时报告 `missing`（缺失）与 `outdated`（过期）；不一致时以退出码 `3` 结束。

### status

只读地输出机器可读状态，供自动化 Agent 判断规则环境是否就绪：

```bash
npx -y @yz-xingtu/agent-rules@latest status --json
```

返回仓库规则源是否存在、操作者身份解析与缺失字段、`AGENTS.md` 的 `missing`/`outdated`/`current` 状态，以及推荐的下一步 `nextAction`（`init`/`sync`/`none`）。

### ensure

幂等入口：一次调用确保规则环境可用且最新。未初始化则 `init`，过期则 `sync`，已最新则不改动文件，最后做一致性检查：

```bash
npx -y @yz-xingtu/agent-rules@latest ensure --non-interactive --json
```

重复运行 `ensure` 不产生无意义变更（第二次 `actions`/`changedFiles` 为空，`status=current`）。

## 生成模型

本工具只有一个生成物：仓库根的 `AGENTS.md`。它是面向所有 AI 编程工具的通用入口，内容由 `.agents/templates/AGENTS.md.tpl` 与操作者身份渲染而来，并指向 `.agents/rules/`、`.agents/skills/` 作为规则与技能源。不再生成 `CLAUDE.md`、`.cursor/`、`.qoder/`、`.codex/`、`.claude/` 等厂商专属文件。

## 非交互与身份解析

`init --non-interactive` 不读取 stdin，操作者身份按优先级解析：**显式参数 > 本地 Git 配置 > `gh` 当前登录身份**。信息不足时返回结构化错误（`code=config_incomplete`，退出码 `2`），列出缺失字段与对应参数，不静默猜测。离线/CI 可设 `AGENT_RULES_NO_GH=1` 禁用 `gh` 探测。

## JSON 输出与退出码

`--json` 时 stdout 只输出最终 JSON（带 `schemaVersion`、`cliVersion`），人类可读进度改走 stderr。稳定退出码：

| 退出码 | 含义 | `status` |
| --- | --- | --- |
| `0` | 成功（含已变更与无需变更） | `ok`/`changed`/`current` |
| `1` | 未预期错误 | `error` |
| `2` | 配置或身份不完整 | `config_incomplete` |
| `3` | 源校验或一致性检查未通过 | `check_failed` |

## 源结构

项目需要在仓库根目录维护 `.agents/`：

```text
.agents/rules/       规则源
.agents/skills/      通用技能源
.agents/templates/   AGENTS.md 模板
.agents/tools/       agent-rules CLI
```

`AGENTS.md` 是本地生成物且含个人身份，建议加入项目 `.gitignore`。

## 发布

这是 npm scoped public 包。首次发布或后续发布公开版本时使用：

```bash
npm publish --access public
```

发布前建议检查：

```bash
npm run check
npm test
npm pack --dry-run
```
