# Agent Project Skeleton

通用 Agent 协作项目骨架，适合新项目初始化时复用 Issue/PR、分支、文档归档、公共规范沉淀与开发硬约束。

## 使用方式

1. 从本仓库创建新项目：点击 GitHub 的 **Use this template**。
2. 运行 `npx -y @yz-xingtu/agent-rules@latest init`，填写当前使用者姓名、GitHub 用户名和提交邮箱。
3. 替换规则源中的占位符：项目名称、仓库地址、默认分支、团队沟通渠道、运行时目录、技术栈和开发硬约束。
4. 按项目情况调整 `.agent/rules/`、`.agent/skills/`、`.agent/team/`，再运行 `npx -y @yz-xingtu/agent-rules@latest sync`。
5. 查看本地生成的 `AGENTS.md` / `CLAUDE.md`，确认项目上下文和使用者信息。
6. 新增通用封装、统一组件、公共工具或跨模块约定时，同步记录到规则源或 `docs/development/`。

## 目录

```text
.agent/rules/
.agent/skills/
.agent/team/
.agent/adapters/
.agent/templates/
.agent/tools/agent-rules/
docs/development/
.github/ISSUE_TEMPLATE/
.github/PULL_REQUEST_TEMPLATE.md
```

`.cursor/`、`.qoder/`、`.codex/`、`.claude/` 等厂商目录由 CLI 本地生成，已加入 `.gitignore`，不作为模板源提交。

## 建议初始化

```bash
npx -y @yz-xingtu/agent-rules@latest init --agents=codex,claude,cursor,qoder
npx -y @yz-xingtu/agent-rules@latest sync
git switch -c chore/initialize-project-rules
```

`init` 会优先按 GitHub 用户名或提交邮箱匹配 `.agent/team/members.yml`，再从 `.agent/team/roles.yml` 写入对应角色说明。`AGENTS.md` 每次都会生成；`CLAUDE.md` 和厂商目录按 `--agents` 选择生成。后续运行 `sync` 会刷新 `AGENTS.md` 和已存在的 `CLAUDE.md`。这些本地文件包含个人身份和协作偏好，已放入 `.gitignore`，不要提交到仓库。
