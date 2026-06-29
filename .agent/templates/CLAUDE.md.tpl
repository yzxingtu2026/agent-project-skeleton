@AGENTS.md

## Claude Code

- 遵守 `AGENTS.md` 中的团队协作规则。
- 需要查团队成员、GitHub 邮箱、钉钉 ID 或角色时，读取 `.agent/team/members.yml`。
- 规则或技能需要调整时，先改元结构，再运行 `node .agent/tools/agent-rules/cli.js sync`。
- 不手工长期维护多套重复 rules/skills 目录。
