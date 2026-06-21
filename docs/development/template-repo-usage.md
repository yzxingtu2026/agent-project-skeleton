# Template Repo 使用说明

## 创建新项目

在 GitHub 仓库首页点击 **Use this template** 创建新仓库。这样只复制当前文件，不复制本仓库的 Issue、PR、提交历史。

## 初始化步骤

1. 替换 `README.md` 中的项目介绍。
2. 复制 `AGENTS.md.example` 为 `AGENTS.md`，填写当前使用者信息。
3. 按项目技术栈调整 `.cursor/rules/main.mdc` 与 `.qoder/rules/main.md` 的开发硬约束。
4. 按团队实际流程调整 `team-escalation` 中的沟通渠道。
5. 配置 GitHub labels、分支保护、Issue 模板与 PR 模板。
6. 如需 `needs-testing` / `tested-pass` 自动化，补充对应 GitHub Actions。

## 维护原则

- `.cursor/rules/*` 与 `.qoder/rules/*` 语义保持一致。
- 面向团队开发者的长说明写入 `docs/development/`。
- 会直接影响 Agent 行为的硬约束写入规则文件。
- 新增公共封装、统一组件、公共工具或跨模块约定时，必须同步沉淀规范。
