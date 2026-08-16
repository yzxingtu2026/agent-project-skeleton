import process from "node:process";

const MAX_MARKDOWN_BYTES = 4096;

function compact(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function envValue(name) {
  return name ? compact(process.env[name]) : "";
}

function utf8Bytes(value) {
  return Buffer.byteLength(value, "utf8");
}

function truncateUtf8(value, maxBytes) {
  if (utf8Bytes(value) <= maxBytes) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (utf8Bytes(value.slice(0, middle)) <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return value.slice(0, low);
}

export function limitWeComMarkdown(content, maxBytes = MAX_MARKDOWN_BYTES) {
  if (utf8Bytes(content) <= maxBytes) return content;

  const lastLink = [...content.matchAll(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g)].at(-1)?.[0] ?? "";
  const suffix = `${lastLink ? `\n\n${lastLink}` : ""}\n\n> 内容已截断，请打开详情链接查看完整信息。`;
  const availableBytes = Math.max(0, maxBytes - utf8Bytes(suffix));
  return `${truncateUtf8(content, availableBytes).trimEnd()}${suffix}`;
}

export function buildWeComPayload({ markdown, mentionUserIds = [], presentation = "auto" }) {
  const userIds = [...new Set(mentionUserIds.map(compact).filter(Boolean))];
  const useMentionMarkdown = userIds.length > 0;
  const msgtype = presentation === "markdown" || useMentionMarkdown ? "markdown" : "markdown_v2";
  const mentions = useMentionMarkdown ? `${userIds.map((userId) => `<@${userId}>`).join(" ")}\n\n` : "";
  const content = limitWeComMarkdown(`${mentions}${compact(markdown)}`);

  return msgtype === "markdown"
    ? { msgtype, markdown: { content } }
    : { msgtype, markdown_v2: { content } };
}

export function resolveWeComWebhookUrl(options = {}) {
  const webhookUrl = options.webhookSecretName
    ? envValue(options.webhookSecretName)
    : envValue("WECOM_WEBHOOK_URL");
  if (!webhookUrl) {
    const secretHint = options.webhookSecretName || "WECOM_WEBHOOK_URL";
    throw new Error(`缺少企业微信机器人 Webhook Secret。请在 GitHub Actions Secrets 中配置 ${secretHint}。`);
  }
  return webhookUrl;
}

export async function postWeComMessage({ webhookUrl, payload }) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`企业微信机器人请求失败：HTTP ${response.status} ${responseText}`);
  }

  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(`企业微信机器人返回了无效 JSON：${responseText}`);
  }
  if (result.errcode !== 0) {
    throw new Error(`企业微信机器人返回失败：${responseText}`);
  }
}
