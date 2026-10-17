# 项目初始化检查清单

- [ ] 替换 `README.md` 中的项目名称、用途和启动说明。
- [ ] 运行 `npx -y @yz-xingtu/agent-rules@latest init`，填写当前使用者姓名、平台用户名和提交邮箱（GitHub/Gitea 通用）。
- [ ] 运行 `npx -y @yz-xingtu/agent-rules@latest sync` 刷新本地入口 `AGENTS.md`。
- [ ] 更新 `.agents/rules/main.md` 的开发硬约束，再运行 `sync`。
- [ ] 更新 `.agents/rules/team-escalation.md` 中的沟通渠道和负责人，再运行 `sync`。
- [ ] 明确哪些目录属于运行时代码，影响 `needs-testing` 判断。
- [ ] 配置 Issue 模板、PR 模板、标签和分支保护。
- [ ] 若使用 `tested-pass` 自动合并，配置对应 CI（GitHub Actions / Gitea Actions）。
