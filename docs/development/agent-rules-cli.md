# Agent Rules CLI

`agent-rules` 从仓库根目录的 `.agent/` 元结构生成各 AI 编程工具可识别的规则和技能文件，避免手工维护多套重复目录。

## 源结构

- `.agent/rules/`：团队通用规则源。
- `.agent/skills/`：通用技能源，首批包含 `qa-assist`。
- `.agent/team/members.yml`：团队成员、GitHub、钉钉和提交邮箱映射。
- `.agent/team/roles.yml`：团队角色说明和通用角色约束。
- `.agent/adapters/`：不同厂商的输出路径和 frontmatter。
- `.agent/templates/`：本地 `AGENTS.md`、`CLAUDE.md` 模板。

## 命令

```bash
agent-rules init
agent-rules sync
agent-rules doctor
```

`init` 每次都会生成通用主引导 `AGENTS.md`，可通过 `--agents=codex,claude,cursor,qoder` 选择额外初始化的 Agent 厂商；默认额外生成 `CLAUDE.md`。选择 `cursor` 或 `qoder` 时，会同步生成对应厂商目录。

`sync` / `doctor` 默认只处理当前仓库已存在的厂商目录，例如 `.qoder/` 或 `.cursor/`。如果没有任何厂商目录，需要显式指定目标：

```bash
agent-rules sync --target=cursor,qoder
```

## 维护原则

- 修改规则时先改 `.agent/rules/`，再运行 `sync`。
- 修改技能时先改 `.agent/skills/`，再运行 `sync`。
- 修改团队成员和提交邮箱时先改 `.agent/team/members.yml`，再运行 `sync`。
- 首次使用或更换操作者时运行 `init`，生成本地 `AGENTS.md` / `CLAUDE.md` 并配置本仓库 Git author。
- `init` 会优先按 GitHub 用户名或提交邮箱匹配 `.agent/team/members.yml`，再从 `.agent/team/roles.yml` 写入对应角色说明。
- `.cursor/`、`.qoder/`、`.codex/`、`.claude/` 等厂商目录是本地生成物，已加入 `.gitignore`，不要长期手工维护或提交。
- 生成文件顶部带中文生成标记。
- `doctor` 用于本地 `sync` 后校验生成物是否一致；厂商目录被忽略时，CI 不应把生成物作为提交物检查。
