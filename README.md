# Agent Project Skeleton

通用 Agent 协作项目骨架，适合新项目初始化时复用 Issue/PR、分支、文档归档、公共规范沉淀与开发硬约束。

## 使用方式

1. 从本仓库创建新项目：点击 GitHub 的 **Use this template**。
2. 复制 `AGENTS.md.example` 为本地 `AGENTS.md`，填写当前使用者、角色和项目上下文。
3. 替换规则中的占位符：项目名称、仓库地址、默认分支、团队沟通渠道、运行时目录、技术栈和开发硬约束。
4. 按项目情况调整 `.cursor/rules/*` 与 `.qoder/rules/*`，保持两套规则语义一致。
5. 新增通用封装、统一组件、公共工具或跨模块约定时，同步记录到规则文件或 `docs/development/`。

## 目录

```text
AGENTS.md.example
.cursor/rules/
.qoder/rules/
docs/development/
.github/ISSUE_TEMPLATE/
.github/PULL_REQUEST_TEMPLATE.md
```

## 建议初始化

```bash
cp AGENTS.md.example AGENTS.md
git switch -c chore/initialize-project-rules
```

`AGENTS.md` 通常包含个人身份和本地协作偏好，建议保持在 `.gitignore` 中，不提交到仓库。
