## 仓库信息

- **项目名称**：`{{PROJECT_NAME}}`
- **代码平台**：{{PLATFORM}}
- **远端仓库**：`{{REPOSITORY_URL}}`
- **默认分支**：`main`（建议受保护，仅接受 PR 合入）
- **Issue/PR 规范/开发规范**：参见 `.agents/rules/main.md`

## 远端操作

- 按「代码平台」选工具：GitHub 用 `gh`；自建 Gitea 用 `tea`（安装、登录与命令见 `.agents/skills/gitea-tea`）。
- 不得把 token/凭据写入仓库、提交历史或日志。

## 启动规范

- 开始新 Issue 前先做冲突预检：查看 open PR，重叠较多或命中公共文件时先确认依赖/优先级。
- 需要提交时，优先使用「当前使用者」中的姓名和提交邮箱配置本仓库 Git author。
- 若任务涉及新通用封装、统一组件、公共工具或跨模块约定，交付时必须同步沉淀规范。

## 当前使用者

- **姓名**：{{USER_NAME}}
- **平台用户名**：{{PLATFORM_USERNAME}}
- **提交邮箱**：{{COMMIT_EMAIL}}
- **角色**：{{USER_ROLE}}
- **常用语言**：{{USER_LANGUAGE}}
