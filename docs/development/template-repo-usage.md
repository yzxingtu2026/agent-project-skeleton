# Template Repo 使用说明

## 创建新项目

在 GitHub 仓库首页点击 **Use this template** 创建新仓库。这样只复制当前文件，不复制本仓库的 Issue、PR、提交历史。

## 初始化步骤

1. 替换 `README.md` 中的项目介绍。
2. 运行 `npx -y @yz-xingtu/agent-rules@latest init`，填写当前使用者姓名、平台用户名和提交邮箱（GitHub/Gitea 通用）。
3. 运行 `npx -y @yz-xingtu/agent-rules@latest sync` 刷新本地入口 `AGENTS.md`。
4. 按项目技术栈调整 `.agents/rules/main.md` 的开发硬约束，再运行 `sync`。
5. 按团队实际流程调整 `.agents/rules/team-escalation.md` 中的沟通渠道，再运行 `sync`。
6. 配置代码平台（GitHub / 自建 Gitea）的 labels、分支保护、Issue 模板与 PR 模板。
7. 如需 `needs-testing` / `tested-pass` 自动化，补充对应 CI（GitHub Actions / Gitea Actions）。

## 维护原则

- `.agents/rules/`、`.agents/skills/` 是规则和技能源结构。
- 仓库根的 `AGENTS.md` 是唯一本地生成物（跨工具通用入口），由 `.agents/tools/agent-rules` 生成，并通过 `.gitignore` 排除。
- 首次使用或更换操作者时运行 `npx -y @yz-xingtu/agent-rules@latest init`。
- 生成物过期时运行 `npx -y @yz-xingtu/agent-rules@latest sync`，它会按 `.agents/` 源刷新 `AGENTS.md`；提交前可运行 `npx -y @yz-xingtu/agent-rules@latest doctor`。
- `AGENTS.md` 的「代码平台」由 `origin` host 自动判定，Agent 据此选 `gh`（GitHub）或 `tea`（自建 Gitea，见 `.agents/skills/gitea-tea`）。

- 面向团队开发者的长说明写入 `docs/development/`。
- 会直接影响 Agent 行为的硬约束写入 `.agents/rules/`。
- 新增公共封装、统一组件、公共工具或跨模块约定时，必须同步沉淀规范。
