import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { postDingTalkMarkdown, resolveDingTalkWebhookUrl } from "./dingtalk-webhook.mjs";

const rootDir = process.cwd();
const configPath = path.join(rootDir, ".github", "dingtalk-notify.yml");
const defaultMembersPath = ".agent/team/members.yml";

function usage() {
  return [
    "用法：",
    "  GITHUB_EVENT_NAME=<事件> GITHUB_EVENT_PATH=<payload.json> node .github/scripts/dingtalk-notify.mjs",
    "",
    "参数：",
    "  --dry-run    只打印钉钉消息 payload，不发送。",
  ].join("\n");
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function compact(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value).trim();
}

function truncateText(value, maxLength = 300) {
  const text = compact(value).replace(/\s+/g, " ");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}...`;
}

function markdownEscape(value) {
  return compact(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function parseYamlScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSimpleYaml(content) {
  const lines = content.split(/\r?\n/);
  const root = {};
  const stack = [{ indent: -1, value: root, parent: null, key: null }];

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }

    const indent = rawLine.match(/^ */)[0].length;
    const line = rawLine.trim();
    const listMatch = /^-\s+(.*)$/.exec(line);

    if (listMatch) {
      while (stack.length > 1 && indent < stack[stack.length - 1].indent) {
        stack.pop();
      }
      const current = stack[stack.length - 1];
      if (!Array.isArray(current.value)) {
        if (!current.parent || !current.key) {
          throw new Error("YAML 列表项缺少父级字段。");
        }
        current.parent[current.key] = [];
        current.value = current.parent[current.key];
      }
      current.value.push(parseYamlScalar(listMatch[1]));
      continue;
    }

    const match = /^([^:]+):(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    const key = match[1].trim();
    const rawValue = match[2].trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].value;

    if (!rawValue) {
      parent[key] = {};
      stack.push({ indent, value: parent[key], parent, key });
    } else if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      parent[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((item) => parseYamlScalar(item))
        .filter((item) => item !== "");
    } else {
      parent[key] = parseYamlScalar(rawValue);
    }
  }

  return root;
}

async function readYaml(relativePath) {
  const content = await fs.readFile(path.join(rootDir, relativePath), "utf8");
  return parseSimpleYaml(content);
}

function isPullRequestIssue(issue) {
  return Boolean(issue?.pull_request);
}

function issueLikeFromPayload(payload) {
  return payload.pull_request ?? payload.issue ?? null;
}

function actorLogin(payload) {
  return compact(payload.sender?.login, "未知");
}

function repoName(payload) {
  return compact(payload.repository?.full_name, process.env.GITHUB_REPOSITORY ?? "未知仓库");
}

function isEnabledEvent(config, eventName, action) {
  if (config.enabled === false) {
    return false;
  }
  const eventConfig = config.events?.[eventName];
  if (!eventConfig) {
    return false;
  }
  const actions = eventConfig.actions ?? [];
  return actions.length === 0 || actions.includes(action);
}

function isIgnoredActor(config, payload) {
  const ignored = config.rules?.ignore_users ?? [];
  return ignored.includes(actorLogin(payload));
}

function shouldSkipMergedPullRequestClose(config, eventName, action, payload) {
  return config.rules?.skip_merged_pr_closed !== false
    && eventName === "pull_request"
    && action === "closed"
    && payload.pull_request?.merged === true;
}

function memberForLogin(membersConfig, login) {
  if (!login) {
    return null;
  }
  return membersConfig.members?.[login] ?? null;
}

function dingtalkUserIdForLogin(membersConfig, login) {
  return compact(memberForLogin(membersConfig, login)?.dingtalk?.user_id);
}

function memberRoleForLogin(membersConfig, login) {
  return compact(memberForLogin(membersConfig, login)?.role);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mentionedLoginsFromText(text, membersConfig) {
  const mentions = [];
  const mentionPattern = /(^|[^\w-])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)/g;
  let match;
  while ((match = mentionPattern.exec(compact(text))) !== null) {
    const login = match[2];
    if (memberForLogin(membersConfig, login)) {
      mentions.push(login);
    }
  }
  return unique(mentions);
}

function loginsFromUsers(users) {
  if (!Array.isArray(users)) {
    return [];
  }
  return users.map((user) => user?.login);
}

function withoutActor(logins, payload, config) {
  if (config.rules?.exclude_actor_from_mentions === false) {
    return logins;
  }
  const actor = actorLogin(payload);
  return logins.filter((login) => login !== actor);
}

function targetLoginsFromExplicitAssignment(config, eventName, action, payload) {
  const rules = config.rules ?? {};
  const targets = [];

  if (eventName === "issues" && action === "assigned" && rules.mention_assignee !== false) {
    targets.push(payload.assignee?.login);
  }
  if (eventName === "pull_request" && action === "assigned" && rules.mention_assignee !== false) {
    targets.push(payload.assignee?.login);
  }
  if (
    eventName === "pull_request"
    && action === "review_requested"
    && rules.mention_requested_reviewer !== false
  ) {
    targets.push(payload.requested_reviewer?.login);
  }

  return unique(targets);
}

function issueOrPrLabel(eventName, item) {
  const type = eventName === "pull_request" || isPullRequestIssue(item) || item?.html_url?.includes("/pull/")
    ? "PR"
    : "Issue";
  return `${type}：#${item?.number ?? "?"} ${item?.title ?? ""}`;
}

function actionText(eventName, action, payload) {
  if (eventName === "issues") {
    return {
      opened: "新建了 Issue",
      assigned: "分配了 Issue",
      closed: "关闭了 Issue",
      reopened: "重新打开了 Issue",
      milestoned: "设置了 Issue 里程碑",
      demilestoned: "移除了 Issue 里程碑",
    }[action] ?? `Issue ${action}`;
  }
  if (eventName === "pull_request") {
    return {
      opened: "新建了 PR",
      assigned: "分配了 PR",
      closed: payload.pull_request?.merged ? "合并了 PR" : "关闭了 PR",
      reopened: "重新打开了 PR",
      ready_for_review: "标记 PR 为可审核",
      review_requested: "请求 PR 审核",
      milestoned: "设置了 PR 里程碑",
      demilestoned: "移除了 PR 里程碑",
    }[action] ?? `PR ${action}`;
  }
  if (eventName === "issue_comment") {
    return isPullRequestIssue(payload.issue) ? "新增了 PR 评论" : "新增了 Issue 评论";
  }
  if (eventName === "pull_request_review") {
    return "提交了 PR 审核";
  }
  if (eventName === "pull_request_review_comment") {
    return "新增了 PR 行评论";
  }
  return `${eventName} ${action}`;
}

function reviewStateText(state) {
  return {
    approved: "已批准",
    changes_requested: "请求修改",
    commented: "已评论",
    dismissed: "已撤销",
    pending: "待提交",
  }[compact(state)] ?? compact(state);
}

function titleForEvent(eventName, action, payload) {
  if (eventName === "issues") {
    return action === "assigned" ? "GitHub Issue 分配" : "GitHub Issue 通知";
  }
  if (eventName === "pull_request") {
    if (action === "review_requested") {
      return "GitHub PR 审核请求";
    }
    return action === "assigned" ? "GitHub PR 分配" : "GitHub PR 通知";
  }
  if (eventName === "issue_comment") {
    return isPullRequestIssue(payload.issue) ? "GitHub PR 评论" : "GitHub Issue 评论";
  }
  if (eventName === "pull_request_review") {
    return "GitHub PR 审核请求";
  }
  if (eventName === "pull_request_review_comment") {
    return "GitHub PR 行评论";
  }
  return "GitHub 通知";
}

function targetLoginsForEvent(config, membersConfig, eventName, action, payload) {
  const rules = config.rules ?? {};
  const explicitTargets = targetLoginsFromExplicitAssignment(config, eventName, action, payload);
  const relatedTargets = [];

  if (eventName === "issue_comment") {
    if (rules.mention_comment_mentions !== false) {
      relatedTargets.push(...mentionedLoginsFromText(payload.comment?.body, membersConfig));
    }

    if (isPullRequestIssue(payload.issue)) {
      if (rules.mention_assignee !== false) {
        relatedTargets.push(...loginsFromUsers(payload.issue?.assignees));
      }
      if (rules.mention_pr_reviewers_on_comment !== false) {
        relatedTargets.push(...loginsFromUsers(payload.issue?.requested_reviewers));
      }
      if (rules.mention_pr_author_on_comment !== false) {
        relatedTargets.push(payload.issue?.user?.login);
      }
    } else {
      if (rules.mention_issue_assignees_on_comment !== false) {
        relatedTargets.push(...loginsFromUsers(payload.issue?.assignees));
      }
      if (rules.mention_issue_author_on_comment !== false) {
        relatedTargets.push(payload.issue?.user?.login);
      }
    }
  }

  if (eventName === "pull_request_review" && rules.mention_pr_author_on_comment !== false) {
    relatedTargets.push(payload.pull_request?.user?.login);
  }
  if (eventName === "pull_request_review_comment" && rules.mention_pr_author_on_comment !== false) {
    relatedTargets.push(payload.pull_request?.user?.login);
  }

  return unique([
    ...explicitTargets,
    ...withoutActor(unique(relatedTargets), payload, config),
  ]);
}

function buildMessage({ config, membersConfig, eventName, payload }) {
  const action = compact(payload.action);
  const item = issueLikeFromPayload(payload);
  const targetLogins = unique(targetLoginsForEvent(config, membersConfig, eventName, action, payload));
  const mentionedUsers = unique(targetLogins.map((login) => dingtalkUserIdForLogin(membersConfig, login)));
  const targetDescriptions = targetLogins.map((login) => {
    const role = memberRoleForLogin(membersConfig, login);
    return role ? `${login}（${role}）` : login;
  });
  const mentionLine = mentionedUsers.length > 0
    ? `${mentionedUsers.map((userId) => `@${userId}`).join(" ")} 请关注这条 GitHub 协作通知。`
    : targetLogins.length > 0
      ? `目标 GitHub 用户：${targetDescriptions.map(markdownEscape).join("、")}（未配置钉钉 userId，未 @）。`
      : "";

  const lines = [
    `## ${titleForEvent(eventName, action, payload)}`,
    "",
  ];

  if (mentionLine) {
    lines.push(mentionLine, "");
  }

  lines.push(
    `仓库：${markdownEscape(repoName(payload))}`,
    `事件：${markdownEscape(actionText(eventName, action, payload))}`,
    `位置：${markdownEscape(issueOrPrLabel(eventName, item))}`,
    `操作人：${markdownEscape(actorLogin(payload))}`,
  );

  const milestone = item?.milestone?.title ?? payload.milestone?.title;
  if (milestone) {
    lines.push(`里程碑：${markdownEscape(milestone)}`);
  }

  if (payload.review?.state) {
    lines.push(`审核状态：${markdownEscape(reviewStateText(payload.review.state))}`);
  }

  const commentBody = payload.comment?.body ?? payload.review?.body;
  const commentUrl = payload.comment?.html_url ?? payload.review?.html_url;
  if (commentBody) {
    lines.push("", `> ${markdownEscape(truncateText(commentBody))}`);
  }

  const url = commentUrl ?? item?.html_url ?? payload.repository?.html_url;
  if (url) {
    lines.push("", `[查看详情](${url})`);
  }

  return {
    title: titleForEvent(eventName, action, payload),
    text: lines.join("\n"),
    atUserIds: mentionedUsers,
  };
}

function isDebounceableEvent(eventName, action) {
  return (eventName === "issues" && action === "assigned")
    || (eventName === "pull_request" && (action === "assigned" || action === "review_requested"));
}

function debounceTargetLogin(eventName, action, payload) {
  if (eventName === "issues" && action === "assigned") {
    return compact(payload.assignee?.login);
  }
  if (eventName === "pull_request" && action === "assigned") {
    return compact(payload.assignee?.login);
  }
  if (eventName === "pull_request" && action === "review_requested") {
    return compact(payload.requested_reviewer?.login);
  }
  return "";
}

function debounceSearchQuery(eventName, action, targetLogin, repoFullName) {
  if (eventName === "issues" && action === "assigned") {
    return `repo:${repoFullName} is:issue assignee:${targetLogin} sort:updated-desc`;
  }
  if (eventName === "pull_request" && action === "assigned") {
    return `repo:${repoFullName} is:pr assignee:${targetLogin} sort:updated-desc`;
  }
  if (eventName === "pull_request" && action === "review_requested") {
    return `repo:${repoFullName} is:pr review-requested:${targetLogin} sort:updated-desc`;
  }
  return "";
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API 请求失败：HTTP ${response.status} ${responseText}`);
  }
  return JSON.parse(responseText);
}

async function recentDebouncedItems({ config, eventName, action, payload }) {
  const fixturePath = compact(process.env.DINGTALK_NOTIFY_DEBOUNCE_FIXTURE);
  if (fixturePath) {
    return fs.readFile(fixturePath, "utf8").then(JSON.parse);
  }

  const token = compact(process.env.GITHUB_TOKEN);
  if (!token) {
    return [];
  }

  const targetLogin = debounceTargetLogin(eventName, action, payload);
  const repoFullName = repoName(payload);
  const query = debounceSearchQuery(eventName, action, targetLogin, repoFullName);
  if (!targetLogin || !query) {
    return [];
  }

  const maxItems = Number(config.rules?.debounce_max_items ?? 10);
  const windowSeconds = Number(config.rules?.debounce_window_seconds ?? 300);
  const minUpdatedAt = Date.now() - windowSeconds * 1000;
  const url = new URL("https://api.github.com/search/issues");
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", String(Math.min(Math.max(maxItems, 1), 20)));

  const data = await githubJson(url, token);
  return (data.items ?? [])
    .filter((item) => Date.parse(item.updated_at) >= minUpdatedAt)
    .slice(0, maxItems)
    .map((item) => ({
      number: item.number,
      title: item.title,
      html_url: item.html_url,
      type: item.pull_request ? "PR" : "Issue",
      creator_login: item.user?.login,
      updated_at: item.updated_at,
    }));
}

function debouncedTargetLogins({ config, eventName, action, payload, items }) {
  const explicitTargets = [
    debounceTargetLogin(eventName, action, payload),
  ];
  const relatedTargets = [
    ...items.map((item) => item.creator_login),
  ];
  return unique([
    ...explicitTargets,
    ...withoutActor(unique(relatedTargets), payload, config),
  ]);
}

function buildDebouncedMessage({ config, membersConfig, eventName, payload, items }) {
  if (items.length <= 1) {
    return null;
  }

  const action = compact(payload.action);
  const targetLogins = debouncedTargetLogins({ config, eventName, action, payload, items });
  const mentionedUsers = unique(targetLogins.map((login) => dingtalkUserIdForLogin(membersConfig, login)));
  const targetDescriptions = targetLogins.map((login) => {
    const role = memberRoleForLogin(membersConfig, login);
    return role ? `${login}（${role}）` : login;
  });
  const title = eventName === "issues" ? "GitHub Issue 分配汇总" : "GitHub PR 协作通知汇总";
  const mentionLine = mentionedUsers.length > 0
    ? `${mentionedUsers.map((userId) => `@${userId}`).join(" ")} 请关注这批 GitHub 协作通知。`
    : targetLogins.length > 0
      ? `目标 GitHub 用户：${targetDescriptions.map(markdownEscape).join("、")}（未配置钉钉 userId，未 @）。`
      : "";
  const lines = [
    `## ${title}`,
    "",
  ];

  if (mentionLine) {
    lines.push(mentionLine, "");
  }

  lines.push(
    `仓库：${markdownEscape(repoName(payload))}`,
    `事件：${markdownEscape(actionText(eventName, action, payload))}`,
    `数量：${items.length}`,
    "",
    ...items.map((item) => `- ${markdownEscape(item.type)}：#${item.number} ${markdownEscape(item.title)}  [查看](${item.html_url})`),
  );

  return {
    title,
    text: lines.join("\n"),
    atUserIds: mentionedUsers,
  };
}

async function main() {
  if (hasFlag("--help")) {
    console.log(usage());
    return;
  }

  const dryRun = hasFlag("--dry-run") || process.env.DINGTALK_NOTIFY_DRY_RUN === "1";
  const eventName = compact(process.env.GITHUB_EVENT_NAME);
  const eventPath = compact(process.env.GITHUB_EVENT_PATH);
  if (!eventName || !eventPath) {
    throw new Error("缺少 GITHUB_EVENT_NAME 或 GITHUB_EVENT_PATH。\n\n" + usage());
  }

  const config = await fs.readFile(configPath, "utf8").then(parseSimpleYaml);
  const membersPath = compact(config.members?.source, defaultMembersPath);
  const [membersConfig, payload] = await Promise.all([
    readYaml(membersPath),
    fs.readFile(eventPath, "utf8").then(JSON.parse),
  ]);

  const action = compact(payload.action);
  if (!isEnabledEvent(config, eventName, action)) {
    console.log(`跳过钉钉通知：${eventName}.${action} 未启用。`);
    return;
  }
  if (isIgnoredActor(config, payload)) {
    console.log(`跳过钉钉通知：操作人 ${actorLogin(payload)} 在忽略名单中。`);
    return;
  }
  if (shouldSkipMergedPullRequestClose(config, eventName, action, payload)) {
    console.log("跳过钉钉通知：已合并 PR 的关闭事件由专用合并通知 workflow 处理。");
    return;
  }

  let message = buildMessage({ config, membersConfig, eventName, payload });
  if (
    config.rules?.debounce_enabled !== false
    && process.env.DINGTALK_NOTIFY_DISABLE_DEBOUNCE !== "1"
    && isDebounceableEvent(eventName, action)
    && (!dryRun || process.env.DINGTALK_NOTIFY_DEBOUNCE_FIXTURE)
  ) {
    const waitSeconds = dryRun ? 0 : Number(config.rules?.debounce_wait_seconds ?? 45);
    if (waitSeconds > 0) {
      console.log(`等待 ${waitSeconds}s 以合并 ${eventName}.${action} 通知。`);
      await sleep(waitSeconds * 1000);
    }
    try {
      const items = await recentDebouncedItems({ config, eventName, action, payload });
      message = buildDebouncedMessage({ config, membersConfig, eventName, payload, items }) ?? message;
    } catch (error) {
      console.warn(`防抖汇总失败，回退为单条通知：${error.message}`);
    }
  }

  if (dryRun) {
    console.log(JSON.stringify({
      msgtype: "markdown",
      markdown: {
        title: message.title,
        text: message.text,
      },
      at: {
        atUserIds: message.atUserIds,
        isAtAll: false,
      },
    }, null, 2));
    return;
  }

  const url = resolveDingTalkWebhookUrl({
    webhookSecretName: compact(config.routes?.default?.webhook_secret_name),
    signSecretName: compact(config.routes?.default?.sign_secret_name),
  });

  await postDingTalkMarkdown({
    webhookUrl: url,
    title: message.title,
    text: message.text,
    atUserIds: message.atUserIds,
  });
  console.log("钉钉通知已发送。");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
