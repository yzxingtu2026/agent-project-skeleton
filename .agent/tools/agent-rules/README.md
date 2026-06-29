# @yz-xingtu/agent-rules

从项目仓库的 `.agent/` 元结构生成各 AI 编程工具可识别的规则、技能和本地入口文件，避免长期手工维护多套重复目录。

## 使用方式

在项目仓库根目录运行：

```bash
npx -y @yz-xingtu/agent-rules@latest init
npx -y @yz-xingtu/agent-rules@latest sync
npx -y @yz-xingtu/agent-rules@latest doctor
```

如果已经全局安装，也可以直接使用 `agent-rules`：

```bash
npm install -g @yz-xingtu/agent-rules
agent-rules init
```

## 命令

### init

初始化当前使用者和 Agent 厂商：

```bash
npx -y @yz-xingtu/agent-rules@latest init --agents=codex,claude,cursor,qoder
```

`init` 会生成本地 `AGENTS.md`，并按 `--agents` 选择生成 `CLAUDE.md`、`.cursor/`、`.qoder/` 等厂商文件，同时配置当前仓库的 `git user.name`、`user.email` 和 `github.user`。

### sync

从 `.agent/` 源结构刷新生成物：

```bash
npx -y @yz-xingtu/agent-rules@latest sync
```

`sync` 会刷新 `AGENTS.md` 和已存在的 `CLAUDE.md`。厂商目录默认按当前项目已存在的 `.cursor/`、`.qoder/` 推断；如果项目还没有厂商目录，需要显式指定：

```bash
npx -y @yz-xingtu/agent-rules@latest sync --target=qoder,cursor
```

### doctor

检查当前生成物是否与 `.agent/` 源结构一致：

```bash
npx -y @yz-xingtu/agent-rules@latest doctor
```

## 源结构

项目需要在仓库根目录维护 `.agent/`：

```text
.agent/rules/       团队规则源
.agent/skills/      通用技能源
.agent/team/        团队成员和角色信息
.agent/adapters/    厂商输出适配配置
.agent/templates/   AGENTS.md / CLAUDE.md 模板
```

`AGENTS.md`、`CLAUDE.md`、`.cursor/`、`.qoder/` 等通常是本地生成物，建议加入项目 `.gitignore`。

## 发布

这是 npm scoped public 包。首次发布或后续发布公开版本时使用：

```bash
npm publish --access public
```

发布前建议检查：

```bash
npm run check
npm pack --dry-run
```
