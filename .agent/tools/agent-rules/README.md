# @yz-xingtu/agent-rules

从项目仓库的 `.agent/` 元结构生成各 AI 编程工具可识别的规则、技能和本地入口文件，避免长期手工维护多套重复目录。

## 使用方式

在项目仓库根目录运行：

```bash
npx -y @yz-xingtu/agent-rules@latest init
npx -y @yz-xingtu/agent-rules@latest sync
npx -y @yz-xingtu/agent-rules@latest doctor
npx -y @yz-xingtu/agent-rules@latest status --agents=codex,qoder --json
npx -y @yz-xingtu/agent-rules@latest ensure --agents=codex,qoder --non-interactive --json
```

如果已经全局安装，也可以直接使用 `agent-rules`：

```bash
npm install -g @yz-xingtu/agent-rules
agent-rules init
```

## 命令

### init

初始化当前使用者和 Agent 厂商：

```bash
npx -y @yz-xingtu/agent-rules@latest init --agents=codex,claude,cursor,qoder
```

`init` 会生成本地 `AGENTS.md`，并按 `--agents` 选择生成 `CLAUDE.md`、`.cursor/`、`.qoder/` 等厂商文件，同时配置当前仓库的 `git user.name`、`user.email` 和 `github.user`。

### sync

从 `.agent/` 源结构刷新生成物：

```bash
npx -y @yz-xingtu/agent-rules@latest sync
```

`sync` 会刷新 `AGENTS.md` 和已存在的 `CLAUDE.md`。厂商目录默认按当前项目已存在的 `.cursor/`、`.qoder/` 推断；如果项目还没有厂商目录，需要显式指定：

```bash
npx -y @yz-xingtu/agent-rules@latest sync --target=qoder,cursor
```

### doctor

检查当前生成物是否与 `.agent/` 源结构一致：

```bash
npx -y @yz-xingtu/agent-rules@latest doctor
```

`doctor` 会同时报告 `missing`（缺失）与 `outdated`（过期）；不一致时以退出码 `3` 结束。

### status

只读地输出机器可读状态，供自动化 Agent 判断规则环境是否就绪：

```bash
npx -y @yz-xingtu/agent-rules@latest status --agents=codex,qoder --json
```

返回仓库规则源是否存在、请求目标、操作者身份解析与缺失字段、每个生成物的 `missing`/`outdated`/`current` 状态，以及推荐的下一步 `nextAction`（`init`/`sync`/`none`）。

### ensure

幂等入口：一次调用确保目标规则环境可用且最新。未初始化则 `init`，过期则 `sync`，已最新则不改动文件，最后做一致性检查：

```bash
npx -y @yz-xingtu/agent-rules@latest ensure --agents=codex,qoder --non-interactive --json
```

重复运行 `ensure` 不产生无意义变更（第二次 `actions`/`changedFiles` 为空，`status=current`）。

## 目标模型

`--agents` 与 `--target` 共用同一套厂商命名，可互换使用；`all`/`auto` 展开全部目标：

- `codex`：根目录 `AGENTS.md`（依赖操作者身份）
- `claude`：根目录 `CLAUDE.md`（依赖操作者身份）
- `cursor`：`.cursor/rules/*.mdc`
- `qoder`：`.qoder/rules/`、`.qoder/skills/`

## 非交互与身份解析

`init --non-interactive` 不读取 stdin，操作者身份按优先级解析：**显式参数 > `.agent/team/members.yml` 匹配 > 本地 Git 配置 > `gh` 当前登录身份**。信息不足时返回结构化错误（`code=config_incomplete`，退出码 `2`），列出缺失字段与对应参数，不静默猜测。离线/CI 可设 `AGENT_RULES_NO_GH=1` 禁用 `gh` 探测。

## JSON 输出与退出码

`--json` 时 stdout 只输出最终 JSON（带 `schemaVersion`、`cliVersion`），人类可读进度改走 stderr。稳定退出码：

| 退出码 | 含义 | `status` |
| --- | --- | --- |
| `0` | 成功（含已变更与无需变更） | `ok`/`changed`/`current` |
| `1` | 未预期错误 | `error` |
| `2` | 配置或身份不完整 | `config_incomplete` |
| `3` | 源校验或一致性检查未通过 | `check_failed` |

## 源结构

项目需要在仓库根目录维护 `.agent/`：

```text
.agent/rules/       团队规则源
.agent/skills/      通用技能源
.agent/team/        团队成员和角色信息
.agent/adapters/    厂商输出适配配置
.agent/templates/   AGENTS.md / CLAUDE.md 模板
```

`AGENTS.md`、`CLAUDE.md`、`.cursor/`、`.qoder/` 等通常是本地生成物，建议加入项目 `.gitignore`。

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
