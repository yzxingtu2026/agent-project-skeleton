# GitHub Issue/PR 钉钉通知

模板内置一套可选的 GitHub Actions 钉钉协作通知能力，用于把 Issue、PR、评论和审核事件推送到项目钉钉群，并按 `.agent/team/members.yml` 自动 @ 对应成员。

## 启用方式

`.github/dingtalk-notify.yml` 默认 `enabled: false`。新项目确认要启用后：

1. 在 GitHub Actions Secrets 中配置钉钉机器人信息。
2. 确认 `.agent/team/members.yml` 已维护成员 GitHub 用户名和钉钉 userId。
3. 将 `.github/dingtalk-notify.yml` 的 `enabled` 改为 `true`。

## 配置 Secret

协作通知默认读取：

```text
DINGTALK_COLLAB_WEBHOOK=<钉钉机器人完整 Webhook URL>
DINGTALK_COLLAB_SIGN_SECRET=<钉钉机器人加签 secret>
```

脚本会用 `DINGTALK_COLLAB_SIGN_SECRET` 自动计算 `timestamp` 和 `sign`，不要把签名参数写死到 Webhook URL。

Webhook URL、access token、加签 secret、手机号等敏感信息不得提交到仓库。

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
    dingtalk:
      user_id: "钉钉 userId"
```

顶层 key 必须与 GitHub login 一致。`role` 用于通知中显示团队分工。`dingtalk.user_id` 为空时仍会发送通知，但不会 @ 该成员。

## 通知规则

通知开关、事件白名单和 @ 策略维护在 `.github/dingtalk-notify.yml`。

默认会聚合相关人并在同一条消息内 @：评论正文中的已绑定 `@github-login`、Issue/PR assignees、PR requested reviewers、Issue/PR 作者。评论、审核、作者等间接相关人会去重并排除当前事件操作者本人；直接 assign 或 request review 的明确目标人会保留 @，即使操作者把任务分配给自己。

批量分配 Issue/PR 或批量请求审核时启用短窗口防抖：同一仓库、同一事件类型、同一目标人的运行只保留最后一次，等待 `debounce_wait_seconds` 后查询最近 `debounce_window_seconds` 内的相关项并合并为一条摘要通知。评论、审核、行评论保持即时通知。

## 本地 dry-run

准备一份 GitHub webhook payload JSON 后执行：

```bash
GITHUB_EVENT_NAME=issues \
GITHUB_EVENT_PATH=/path/to/issues-assigned.json \
node .github/scripts/dingtalk-notify.mjs --dry-run
```

dry-run 只打印即将发送给钉钉的 JSON，不调用真实 Webhook。

## 验证清单

- 新建 Issue 后钉钉群收到普通通知。
- 将 Issue assign 给已绑定成员后，钉钉群收到通知并 @ 对应成员。
- 新建 PR 后钉钉群收到普通通知。
- 请求已绑定成员审核 PR 后，钉钉群收到通知并 @ 对应成员。
- 短时间内批量 assign / request review 时，同一目标人收到一条汇总通知，而不是多条刷屏通知。
- Issue 评论、PR 评论、PR 审核、PR 行评论新增时，钉钉群收到摘要与链接。
- 未绑定成员参与事件时，通知仍发送，但不 @ 人。
- Action 日志不打印 Webhook URL 或 token。
