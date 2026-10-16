# Agent Project Skeleton

通用 Agent 协作项目骨架，适合新项目初始化时复用 Issue/PR、分支、文档归档、公共规范沉淀与开发硬约束。

## 使用方式

1. 从本仓库创建新项目：点击 GitHub 的 **Use this template**。
2. 运行 `npx -y @yz-xingtu/agent-rules@latest init`，填写当前使用者姓名、GitHub 用户名和提交邮箱。
3. 替换规则源中的占位符：项目名称、仓库地址、默认分支、团队沟通渠道、运行时目录、技术栈和开发硬约束。
4. 按项目情况调整 `.agents/rules/`、`.agents/skills/`，再运行 `npx -y @yz-xingtu/agent-rules@latest sync`。
5. 查看本地生成的 `AGENTS.md`，确认项目上下文和使用者信息。
6. 新增通用封装、统一组件、公共工具或跨模块约定时，同步记录到规则源或 `docs/development/`。

## 目录

```text
.agents/rules/
.agents/skills/
.agents/templates/
.agents/tools/agent-rules/
docs/development/
.github/ISSUE_TEMPLATE/
.github/PULL_REQUEST_TEMPLATE.md
```

规则与技能统一维护在 `.agents/` 目录，不再扇出 `.cursor/`、`.qoder/` 等厂商专属规则；各 AI 编程工具直接读取 `.agents/` 与仓库根的 `AGENTS.md`。`AGENTS.md` 由 CLI 本地生成、含个人身份，已加入 `.gitignore`，不作为模板源提交。

## 建议初始化

```bash
npx -y @yz-xingtu/agent-rules@latest init
npx -y @yz-xingtu/agent-rules@latest sync
git switch -c chore/initialize-project-rules
```

`init` 按「显式参数 > 本地 Git 配置 > `gh` 当前登录身份」解析操作者身份，生成仓库根唯一的跨工具入口 `AGENTS.md` 并配置本仓库 Git author。后续运行 `sync` 会按 `.agents/` 源刷新 `AGENTS.md`。该本地文件包含个人身份和协作偏好，已放入 `.gitignore`，不要提交到仓库。

