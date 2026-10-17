# tea 仓库操作命令总表

> 约定：`<idx>` 为 Issue/PR 编号；在仓库根目录运行；多实例时加 `-l <login名>`；机器可读输出加 `-o json`（或 `yaml/csv/tsv/simple/table`）。任意命令的完整参数用 `tea <命令> <子命令> -h` 查。本表随 tea 0.16.0 逐条 `-h` 核实。

## 全局通用参数

不切目录也能操作别的仓库/实例：

```
-l, --login <name>     指定用哪个 Gitea login（多实例时）
-r, --repo <slug|路径>  覆盖仓库：owner/repo 或本地路径
-R, --remote <name>    从指定 git remote 发现 login
-o, --output <fmt>     simple|table|csv|tsv|yaml|json（脚本解析用 json）
-f, --fields <list>    list/view 时选择输出字段
```

## Issue

```bash
tea issues list --state open                       # --state all|open|closed
tea issues list -L needs-testing -o json           # 按标签过滤 + JSON
tea issues <idx> --comments                         # 单个 Issue 详情（含评论）
tea issues create --title "标题" --description "正文" \
  --labels bug --assignees someone --milestone v1  # --description-file 从文件/stdin 读
tea issues edit <idx> --add-labels tested-pass --remove-labels needs-testing
tea issues edit <idx> --milestone ""               # 空串=清除该属性
tea issues close <idx>       # 关闭（可多编号）
tea issues reopen <idx>      # 重开
```

列表过滤：`-k 关键字`、`-L 标签`、`-m 里程碑`、`-A 作者`、`-a 指派给`、`-M 提及`、`-F 起始日期`、`-u 截止日期`、`-p 页码`、`--lm 每页数量`、`-f 字段列表`、`-K issues|pulls|all`。

## Pull Request（审查/合并全生命周期）

```bash
tea pulls list --state open
tea pulls <idx> --comments
tea pulls <idx> -f index,title,state,mergeable,labels,ci -o json
tea pulls checkout <idx> -b                        # 检出 PR 分支（-b 无则建本地分支）

tea pulls create --base main --head feat/x \
  --title "标题" --description "正文" \
  --labels needs-testing --assignees reviewer
tea pulls create --draft ...                        # 草稿（标题加 WIP:）

# 审查与合并
tea pulls approve <idx> "代码审查通过，测试已通过，允许合并。"   # 别名 lgtm/a
tea pulls reject <idx> "需要修改：<原因>"                       # 请求变更
tea pulls review <idx>                               # 交互式逐行审查
tea pulls review-comments <idx>                      # 列出审查评论
tea pulls resolve <idx> <comment-id>                 # 解决审查评论（unresolve 反解）
tea pulls reply <idx> ...                            # 回复审查评论
tea pulls merge <idx> --style squash -t "标题" -m "说明"   # style: merge|rebase|squash|rebase-merge

# 编辑 / 状态
tea pulls edit <idx> --add-labels tested-pass --remove-labels needs-testing
tea pulls edit <idx> --add-reviewers someone --ready    # --ready 去 WIP；--draft 反之
tea pulls close <idx> / reopen <idx>
tea pulls clean <idx>                                # 删已关闭 PR 的本地+远端特性分支
```

## 评论（Issue / PR 通用）

```bash
tea comments <idx> "正文"          # 简写：等价于 comments add
tea comments add <idx> -d "正文"
tea comments list <idx>
tea comments edit <idx> <comment-id> -d "新正文"
tea comments delete <idx> <comment-id>
```

## 标签 / 里程碑

```bash
tea labels list
tea labels create --name tested-pass --color "#0e8a16" --description "测试通过"
tea labels update <id> --name x --color "#fff"
tea labels delete <id>

tea milestones list
tea milestones create --title v1 --description "..." --deadline 2026-12-31
tea milestones issues <id>        # 管理里程碑下的 issue/pr
tea milestones close <id> / reopen <id> / delete <id>
```

## 发布 / 附件

```bash
tea releases list
tea releases create <tag> --title "v1.0" --note "发布说明" --asset ./dist/app.zip
tea releases create <tag> -f ./RELEASE_NOTES.md      # 从文件读说明（--note-file）
tea releases edit <tag> --title "..." --draft --prerelease
tea releases assets list <tag>                       # 附件用 create --asset 上传
tea releases delete <tag>
```

## 分支 / 仓库 / 组织

```bash
tea branches list                       # 含保护状态
tea branches protect main               # 保护（unprotect 取消）
tea branches rename <old> <new>

tea repos list                          # 我有权访问的仓库
tea repos search <关键字>
tea repos create --name new-repo --owner <org> --private --init --readme Default
tea repos create-from-template ...      # 从模板仓库创建
tea repos fork <owner>/<repo>
tea repos edit <owner>/<repo> --description "..."
tea repos delete <owner>/<repo>         # 危险：执行前确认
tea repos migrate ...                   # 迁移外部仓库进来

tea organizations list / create / delete
```

## CI(Actions) / Wiki / Webhook / 通知 / 工时

```bash
tea actions runs list                   # 运行记录（view/logs/delete|cancel）
tea actions workflows list              # 工作流定义
tea actions secrets list/create/delete  # 机密（create 别名 add/set）
tea actions variables list/create/delete

tea wiki list / view <page> / create / edit / delete
tea webhooks list / create / update / delete      # 支持 --repo/--org/--global
tea notifications list --states unread            # read/unread/pin/unpin
tea times list / add <idx> 1h25m / delete / reset # 工时追踪
```

## 其它助手

```bash
tea open                               # 浏览器打开当前仓库
tea clone <owner>/<repo> [dir]         # 免本地 git 克隆
tea ssh-keys list / add / delete       # 管理账号 SSH 公钥
tea admin users ...                    # 实例管理员操作（需管理员权限）
```

## gh ↔ tea 命令对照

`.agents/rules/` 的工作流以 `gh` 写法为准；在 Gitea 仓库里按下表换成 tea：

| 场景 | GitHub `gh` | Gitea `tea` |
| --- | --- | --- |
| 列 open PR | `gh pr list` | `tea pulls list --state open` |
| 看 PR 详情(JSON) | `gh pr view <n> --json ...` | `tea pulls <n> -f ... -o json` |
| 检出 PR 分支 | `gh pr checkout <n>` | `tea pulls checkout <n> -b` |
| 建 PR | `gh pr create` | `tea pulls create --base ... --title ...` |
| 批准 | `gh pr review <n> --approve` | `tea pulls approve <n> "..."` |
| 请求变更 | `gh pr review <n> --request-changes` | `tea pulls reject <n> "原因"` |
| 加/去标签 | `gh pr edit <n> --add-label/--remove-label` | `tea pulls edit <n> --add-labels/--remove-labels` |
| 合并 | `gh pr merge <n> --squash` | `tea pulls merge <n> --style squash` |
| 建 Issue | `gh issue create` | `tea issues create --title ... --description ...` |
| 评论 | `gh pr comment <n> --body` | `tea comments <n> "正文"` |
| 原始 API | `gh api <path>` | `tea api <path>` |

**收口顺序**（主分支保护要求审批时）：先 approve，再改标签，最后复核——

```bash
tea pulls approve <idx> "代码审查通过，测试已通过，允许合并。"
tea pulls edit <idx> --remove-labels needs-testing --add-labels tested-pass
tea pulls <idx> -o json      # 复核状态
```

tea 没有 gh 那种「标签自动合并」内建；合并用 `tea pulls merge` 或按团队策略处理。
