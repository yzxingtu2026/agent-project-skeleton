## 仓库信息

- **项目名称**：`{{PROJECT_NAME}}`
- **GitHub 仓库**：`{{GITHUB_REPOSITORY}}`
- **默认分支**：`main`（建议受保护，仅接受 PR 合入）
- **Issue/PR 规范/开发规范**：参见 `.agent/rules/main.md`

## 启动规范

- 开始处理任务前，先阅读 `AGENTS.md`；使用 Cursor/Qoder 时同步读取对应 rules 目录。
- 开始新 Issue 前先做冲突预检：查看 open PR，重叠较多或命中公共文件时先确认依赖/优先级。
- 需要提交时，优先使用「当前使用者」中的姓名和 GitHub 提交邮箱配置本仓库 Git author。
- 若任务涉及新通用封装、统一组件、公共工具或跨模块约定，交付时必须同步沉淀规范。
- 需要查团队成员、GitHub 邮箱、钉钉 ID 或角色时，读取 `.agent/team/members.yml` 和 `.agent/team/roles.yml`。

## 当前使用者

- **姓名**：{{USER_NAME}}
- **GitHub 用户名**：{{GITHUB_USERNAME}}
- **GitHub 提交邮箱**：{{GITHUB_EMAIL}}
- **角色**：{{USER_ROLE}}
- **常用语言**：{{USER_LANGUAGE}}

## 使用者角色

{{USER_ROLE_GUIDE}}

## 约束

{{ROLE_COMMON_CONSTRAINTS}}
