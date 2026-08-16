# GitHub Issue/PR 企业微信通知

模板内置一套可选的 GitHub Actions 企业微信协作通知能力，用于把 Issue/PR 分配、评论、审核和 main 分支更新事件推送到项目企业微信群，并按 `.agent/team/members.yml` 自动提醒对应成员。

## 消息展示策略

通知核心先生成平台中性的 Markdown 内容，再由企业微信 Provider 选择消息类型：

- 存在有效企业微信 userid 时使用普通 `markdown`，并在正文前插入 `<@userid>` 完成成员提醒。
- 无需提醒成员时使用 `markdown_v2`，支持更完整的列表、分隔线、表格和代码排版。
- `markdown_v2` 不支持提醒成员，因此不得用于分配、审核请求等存在明确处理人的通知。
- 消息按 UTF-8 字节数限制在 4096 字节以内；超限时自动截断并尽量保留最后的详情链接。

## 启用方式

1. 在目标企业微信群中创建消息推送，取得 Webhook URL。
2. 在 GitHub Actions Secrets 中配置 `WECOM_COLLAB_WEBHOOK`。
3. 确认 `.agent/team/members.yml` 已维护成员 GitHub 用户名和企业微信 userid。
4. 将 `.github/notification.yml` 的 `enabled` 改为 `true`。

Webhook URL 中包含调用凭证，禁止提交到仓库、Issue、PR、日志或公开文档。

## 维护成员映射

成员映射统一维护在 `.agent/team/members.yml`：

```yaml
members:
  github-login:
    name: "成员姓名"
    role: "PM项目经理"
    github:
      username: "github-login"
      email: "github-login@users.noreply.github.com"
    notifications:
      wecom:
        user_id: "企业微信 userid"
```

顶层 key 必须与 GitHub login 一致。`role` 用于通知中显示团队分工。`notifications.wecom.user_id` 为空时仍会发送通知，但不会提醒该成员。

## 通知规则

通知开关、事件白名单和提醒策略维护在 `.github/notification.yml`。

默认不通知单纯的新建 Issue / 新建 PR，也不通知关闭、重开、里程碑等普通状态变化。Issue/PR 生命周期事件只在 assign 或 request review 等有明确处理对象时推送。

协作通知会聚合评论正文中已绑定的 `@github-login`、Issue/PR assignees、PR requested reviewers 和 Issue/PR 作者。间接相关人会去重并排除当前事件操作者；直接 assign 或 request review 的目标人会保留提醒。

批量分配 Issue/PR 或批量请求审核时启用短窗口防抖。同一仓库、同一事件类型、同一目标人的运行只保留最后一次，并在等待窗口后合并为一条摘要。企业微信群机器人单个 Webhook 每分钟最多发送 20 条消息，因此不要移除防抖机制。

main 分支更新由 `.github/workflows/github-notify-main-updated.yml` 单独通知，会提醒所有配置了企业微信 userid 的成员拉取最新代码。

## 本地 dry-run

准备一份 GitHub webhook payload JSON 后执行：

```bash
GITHUB_EVENT_NAME=issues \
GITHUB_EVENT_PATH=/path/to/issues-assigned.json \
node .github/scripts/github-notify.mjs --dry-run
```

dry-run 只打印将发送给企业微信的真实 JSON payload，不调用 Webhook。

## 验证清单

- Issue/PR 分配或审核请求存在有效 userid 时，payload 使用 `markdown` 并包含 `<@userid>`。
- 无提醒目标的通知使用 `markdown_v2`。
- 批量 assign / request review 合并为一条摘要通知。
- Issue 评论、PR 评论、PR 审核和行评论包含摘要与详情链接。
- main 分支更新提醒全部已绑定成员。
- 未绑定成员参与事件时仍发送通知，但不执行提醒。
- Action 日志不打印 Webhook URL 或其中的 key。
