import crypto from "node:crypto";

function compact(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function envValue(name) {
  return name ? compact(process.env[name]) : "";
}

function signedWebhookUrl(webhookUrl, signSecret) {
  if (!signSecret) {
    return webhookUrl;
  }

  const timestamp = Date.now().toString();
  const stringToSign = `${timestamp}\n${signSecret}`;
  const sign = crypto
    .createHmac("sha256", signSecret)
    .update(stringToSign, "utf8")
    .digest("base64");

  const url = new URL(webhookUrl);
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("sign", sign);
  return url.toString();
}

export function resolveDingTalkWebhookUrl(options = {}) {
  const webhookUrl = options.webhookSecretName
    ? envValue(options.webhookSecretName)
    : (envValue("DINGTALK_WEBHOOK") || envValue("DINGTALK_WEBHOOK_URL"));

  if (!webhookUrl) {
    const secretHint = options.webhookSecretName || "DINGTALK_WEBHOOK";
    throw new Error(`DingTalk webhook secret is missing. Configure ${secretHint} in GitHub Actions Secrets.`);
  }

  const signSecret = options.signSecretName
    ? envValue(options.signSecretName)
    : (envValue("DINGTALK_SIGN_SECRET") || envValue("DINGTALK_WEBHOOK_SIGN_SECRET"));

  return signedWebhookUrl(webhookUrl, signSecret);
}

export async function postDingTalkMarkdown({ webhookUrl, title, text, atUserIds = [] }) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: {
        title,
        text,
      },
      at: {
        atUserIds,
        isAtAll: false,
      },
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`DingTalk webhook failed: HTTP ${response.status} ${responseText}`);
  }

  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    result = { raw: responseText };
  }

  if (result.errcode && result.errcode !== 0) {
    throw new Error(`DingTalk webhook failed: ${responseText}`);
  }
}
