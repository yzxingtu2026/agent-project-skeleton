import process from "node:process";
import { buildWeComPayload, postWeComMessage, resolveWeComWebhookUrl } from "./wecom-webhook.mjs";

function compact(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function parseMentionUserIds(value) {
  return compact(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMarkdownText(value) {
  return compact(value).replaceAll("\\n", "\n");
}

async function main() {
  const markdown = normalizeMarkdownText(process.env.NOTIFICATION_MARKDOWN);
  if (!markdown) {
    throw new Error("缺少 NOTIFICATION_MARKDOWN。");
  }

  const webhookUrl = resolveWeComWebhookUrl({
    webhookSecretName: compact(process.env.NOTIFICATION_WEBHOOK_SECRET_NAME),
  });

  const payload = buildWeComPayload({
    markdown,
    mentionUserIds: parseMentionUserIds(process.env.NOTIFICATION_MENTION_USER_IDS),
  });
  await postWeComMessage({ webhookUrl, payload });

  console.log("企业微信通知已发送。");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
