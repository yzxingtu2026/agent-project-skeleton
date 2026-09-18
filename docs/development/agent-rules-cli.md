# Agent Rules CLI

`agent-rules` 从仓库根目录的 `.agent/` 元结构生成各 AI 编程工具可识别的规则和技能文件，避免手工维护多套重复目录。

## 源结构

- `.agent/rules/`：团队通用规则源。
- `.agent/skills/`：通用技能源，首批包含 `qa-assist`。
- `.agent/team/members.yml`：团队成员、GitHub、企业微信通知和提交邮箱映射。
- `.agent/team/roles.yml`：团队角色说明和通用角色约束。
- `.agent/adapters/`：不同厂商的输出路径和 frontmatter。
- `.agent/templates/`：本地 `AGENTS.md`、`CLAUDE.md` 模板。

## 命令

```bash
npx -y @yz-xingtu/agent-rules@latest init
npx -y @yz-xingtu/agent-rules@latest sync
npx -y @yz-xingtu/agent-rules@latest doctor
npx -y @yz-xingtu/agent-rules@latest status --agents=codex,qoder --json
npx -y @yz-xingtu/agent-rules@latest ensure --agents=codex,qoder --non-interactive --json
```

`init` 每次都会生成通用主引导 `AGENTS.md`，可通过 `--agents=codex,claude,cursor,qoder` 选择额外初始化的 Agent 厂商；默认额外生成 `CLAUDE.md`。选择 `cursor` 或 `qoder` 时，会同步生成对应厂商目录。

`sync` 会刷新本地 `AGENTS.md` 和已存在的 `CLAUDE.md`，再同步厂商目录。`sync` / `doctor` 默认只处理当前仓库已存在的厂商目录与本地入口文件；如果没有任何生成物，需要显式指定目标：

```bash
npx -y @yz-xingtu/agent-rules@latest sync --target=codex,cursor,qoder
```

## 目标模型（target / agents 统一）

`--agents` 与 `--target` 共用同一套厂商命名，可互换使用；`all` / `auto` 展开全部目标：

| 目标 | 管理的生成物 |
| --- | --- |
| `codex` | 根目录 `AGENTS.md`（通用主引导，依赖操作者身份） |
| `claude` | 根目录 `CLAUDE.md`（依赖操作者身份） |
| `cursor` | `.cursor/rules/*.mdc` |
| `qoder` | `.qoder/rules/`、`.qoder/skills/` |

`sync` / `doctor` / `status` / `ensure` 现在都能按目标处理本地入口文件与厂商目录；`doctor` 会同时报告 `missing`（缺失）与 `outdated`（过期）。

## 面向自动化 Agent 的接口

### status

```bash
agent-rules status --agents=codex,qoder --json
```

只读地汇总：仓库规则源是否存在、请求的目标、操作者身份解析与缺失字段、每个生成物的 `missing` / `outdated` / `current` 状态，以及推荐的下一步动作 `nextAction`（`init` / `sync` / `none`）。

### ensure（幂等入口）

```bash
agent-rules ensure --agents=codex,qoder --non-interactive --json
```

一次调用即可确保目标规则环境可用且最新：未初始化则 `init`，过期则 `sync`，已最新则不改动文件，最后执行一致性检查。重复运行不产生无意义变更（第二次 `actions` 与 `changedFiles` 为空，`status=current`）。

### 非交互 init

```bash
agent-rules init --non-interactive --agents=codex,qoder \
  --name="张三" --github-user=zhangsan --github-email=zhangsan@users.noreply.github.com --json
```

非交互模式不读取 stdin。操作者身份按优先级解析：**显式参数 > `.agent/team/members.yml` 匹配 > 本地 Git 配置 > `gh` 当前登录身份**。信息不足时返回结构化错误（`code=config_incomplete`），列出缺失字段与对应参数，不静默猜测或写入错误身份。离线 / CI 环境可设 `AGENT_RULES_NO_GH=1` 禁用 `gh` 探测，保证行为可确定。

### JSON 输出与退出码

- `--json` 时 **stdout 只输出最终 JSON**，人类可读进度改走 stderr；字段结构带 `schemaVersion`（当前 `1.0`）与 `cliVersion`。
- JSON 顶层字段：`command`、`status`、`repoRoot`、`sourcesPresent`、`targets`、`operator`、`targetStatus`、`artifacts`、`nextAction`，以及 `ensure`/`sync` 的 `actions`、`changedFiles`、`check`，错误时的 `errors`。
- 稳定退出码：

| 退出码 | 含义 | 对应 `status` |
| --- | --- | --- |
| `0` | 成功（含“已变更”与“无需变更”） | `ok` / `changed` / `current` |
| `1` | 未预期错误（如缺少 `.agent` 工作区） | `error` |
| `2` | 配置或操作者身份不完整 | `config_incomplete` |
| `3` | 源校验失败或生成物一致性检查未通过 | `check_failed` |

- 路径、中文身份与 UTF-8 输出在 Windows / macOS / Linux 表现一致。

## 本地开发

```bash
node .agent/tools/agent-rules/cli.js <命令>
cd .agent/tools/agent-rules && npm run check && npm test
```

`npm run check` 对 `cli.js` 与 `src/*.js` 做跨平台语法检查；`npm test` 使用 Node 内置 `node:test` 运行 `test/` 下的自动化测试（覆盖幂等、目标解析、身份缺失、doctor 退出码、JSON 纯净度等）。

## 维护原则

- 修改规则时先改 `.agent/rules/`，再运行 `sync`。
- 修改技能时先改 `.agent/skills/`，再运行 `sync`。
- 修改团队成员和提交邮箱时先改 `.agent/team/members.yml`，再运行 `sync`。
- 首次使用或更换操作者时运行 `init`，生成本地 `AGENTS.md` / `CLAUDE.md` 并配置本仓库 Git author；规则更新后运行 `sync` 刷新本地入口文件。
- `init` 会优先按 GitHub 用户名或提交邮箱匹配 `.agent/team/members.yml`，再从 `.agent/team/roles.yml` 写入对应角色说明。
- `.cursor/`、`.qoder/`、`.codex/`、`.claude/` 等厂商目录是本地生成物，已加入 `.gitignore`，不要长期手工维护或提交。
- 生成文件顶部带中文生成标记。
- `doctor` 用于本地 `sync` 后校验生成物是否一致；厂商目录被忽略时，CI 不应把生成物作为提交物检查。
