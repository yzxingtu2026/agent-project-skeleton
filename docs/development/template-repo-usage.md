# Template Repo 使用说明

## 创建新项目

在 GitHub 仓库首页点击 **Use this template** 创建新仓库。这样只复制当前文件，不复制本仓库的 Issue、PR、提交历史。

## 初始化步骤

1. 替换 `README.md` 中的项目介绍。
2. 运行 `npx -y @yz-xingtu/agent-rules@latest init`，填写当前使用者姓名、GitHub 用户名和提交邮箱。
3. 运行 `npx -y @yz-xingtu/agent-rules@latest sync` 生成规则和技能文件。
4. 按项目技术栈调整 `.agent/rules/main.md` 的开发硬约束，再运行 `sync`。
5. 按团队实际流程调整 `.agent/rules/team-escalation.md` 中的沟通渠道，再运行 `sync`。
6. 配置 GitHub labels、分支保护、Issue 模板与 PR 模板。
7. 如需 `needs-testing` / `tested-pass` 自动化，补充对应 GitHub Actions。

## 维护原则

- `.agent/rules/`、`.agent/skills/`、`.agent/team/` 是规则、技能和团队信息源结构。
- `.agent/team/members.yml` 维护成员身份；`.agent/team/roles.yml` 维护角色说明，`init` 会按 GitHub 信息匹配并写入本地入口文件。
- `.cursor/rules/*`、`.qoder/rules/*`、`.qoder/skills/*` 由 `.agent/tools/agent-rules` 本地生成，并通过 `.gitignore` 排除。
- 首次使用或更换操作者时运行 `npx -y @yz-xingtu/agent-rules@latest init`。
- 生成物过期时运行 `npx -y @yz-xingtu/agent-rules@latest sync`，它会刷新本地入口文件并同步当前已存在的厂商目录；提交前可运行 `npx -y @yz-xingtu/agent-rules@latest doctor`。
- 面向团队开发者的长说明写入 `docs/development/`。
- 会直接影响 Agent 行为的硬约束写入 `.agent/rules/`。
- 新增公共封装、统一组件、公共工具或跨模块约定时，必须同步沉淀规范。
