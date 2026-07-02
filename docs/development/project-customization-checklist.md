# 项目初始化检查清单

- [ ] 替换 `README.md` 中的项目名称、用途和启动说明。
- [ ] 运行 `npx -y @yz-xingtu/agent-rules@latest init`，填写当前使用者姓名、GitHub 用户名和提交邮箱。
- [ ] 运行 `npx -y @yz-xingtu/agent-rules@latest sync` 生成规则和技能文件。
- [ ] 更新 `.agent/rules/main.md` 的开发硬约束，再运行 `sync`。
- [ ] 更新 `.agent/rules/team-escalation.md` 中的沟通渠道和负责人，再运行 `sync`。
- [ ] 更新 `.agent/team/members.yml` 中的团队成员、GitHub 邮箱和钉钉 ID。
- [ ] 更新 `.agent/team/roles.yml` 中的团队角色说明和通用角色约束。
- [ ] 如需 GitHub Issue/PR 钉钉实时通知，配置 `DINGTALK_COLLAB_WEBHOOK` / `DINGTALK_COLLAB_SIGN_SECRET`，再启用 `.github/dingtalk-notify.yml`。
- [ ] 明确哪些目录属于运行时代码，影响 `needs-testing` 判断。
- [ ] 配置 Issue 模板、PR 模板、标签和分支保护。
- [ ] 若使用 `tested-pass` 自动合并，配置对应 GitHub Actions。
