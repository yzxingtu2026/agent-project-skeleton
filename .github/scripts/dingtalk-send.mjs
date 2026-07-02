import process from "node:process";
import { postDingTalkMarkdown, resolveDingTalkWebhookUrl } from "./dingtalk-webhook.mjs";

function compact(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function parseAtUserIds(value) {
  return compact(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMarkdownText(value) {
  return compact(value).replaceAll("\\n", "\n");
}

async function main() {
  const title = compact(process.env.DINGTALK_TITLE);
  const text = normalizeMarkdownText(process.env.DINGTALK_TEXT);
  if (!title || !text) {
    throw new Error("缺少 DINGTALK_TITLE 或 DINGTALK_TEXT。");
  }

  const webhookUrl = resolveDingTalkWebhookUrl({
    webhookSecretName: compact(process.env.DINGTALK_WEBHOOK_SECRET_NAME),
    signSecretName: compact(process.env.DINGTALK_SIGN_SECRET_NAME),
  });

  await postDingTalkMarkdown({
    webhookUrl,
    title,
    text,
    atUserIds: parseAtUserIds(process.env.DINGTALK_AT_USER_IDS),
  });

  console.log("钉钉通知已发送。");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
