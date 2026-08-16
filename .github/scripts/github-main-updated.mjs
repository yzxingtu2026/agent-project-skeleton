import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildWeComPayload, postWeComMessage, resolveWeComWebhookUrl } from "./wecom-webhook.mjs";

const rootDir = process.cwd();
const membersPath = ".agent/team/members.yml";
const configPath = ".github/notification.yml";

function compact(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value).trim();
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
    } else {
      parent[key] = parseYamlScalar(rawValue);
    }
  }

  return root;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function allWeComUserIds(membersConfig) {
  return unique(
    Object.values(membersConfig.members ?? {})
      .map((member) => compact(member?.notifications?.wecom?.user_id)),
  );
}

function memberDisplayNameForLogin(membersConfig, login) {
  const member = membersConfig.members?.[login];
  const name = compact(member?.name);
  const role = compact(member?.role);
  if (!name) return compact(login, "未知");
  return role ? `${name}（${role}）` : name;
}

function shortSha(value) {
  return compact(value).slice(0, 7);
}

function buildMessage({ membersConfig }) {
  const repository = compact(process.env.GITHUB_REPOSITORY, "未知仓库");
  const sha = compact(process.env.GITHUB_SHA);
  const actor = compact(process.env.GITHUB_ACTOR, "未知");
  const serverUrl = compact(process.env.GITHUB_SERVER_URL, "https://github.com");
  const runId = compact(process.env.GITHUB_RUN_ID);
  const repoUrl = `${serverUrl}/${repository}`;
  const compareUrl = sha ? `${repoUrl}/commit/${sha}` : repoUrl;
  const runUrl = runId ? `${repoUrl}/actions/runs/${runId}` : repoUrl;
  const mentionUserIds = allWeComUserIds(membersConfig);
  const mentionLine = "main 分支已更新，请团队成员拉取最新代码。";

  return {
    title: "GitHub main 分支更新",
    markdown: [
      "## GitHub main 分支更新",
      "",
      mentionLine,
      "",
      `仓库：${markdownEscape(repository)}`,
      `分支：main`,
      `提交：${markdownEscape(shortSha(sha) || "未知")}`,
      `触发人：${markdownEscape(memberDisplayNameForLogin(membersConfig, actor))}`,
      "",
      `[查看提交](${compareUrl}) · [查看工作流](${runUrl})`,
    ].join("\n"),
    mentionUserIds,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.env.NOTIFICATION_DRY_RUN === "1";
  const [config, membersConfig] = await Promise.all([
    fs.readFile(path.join(rootDir, configPath), "utf8").then(parseSimpleYaml),
    fs.readFile(path.join(rootDir, membersPath), "utf8").then(parseSimpleYaml),
  ]);
  if (config.enabled === false && process.env.NOTIFICATION_FORCE_ENABLED !== "1" && !dryRun) {
    console.log("跳过 main 分支更新通知：通知未启用。");
    return;
  }
  const message = buildMessage({ membersConfig });

  if (dryRun) {
    console.log(JSON.stringify(buildWeComPayload(message), null, 2));
    return;
  }

  const webhookUrl = resolveWeComWebhookUrl({
    webhookSecretName: "WECOM_COLLAB_WEBHOOK",
  });
  await postWeComMessage({ webhookUrl, payload: buildWeComPayload(message) });
  console.log("main 分支更新通知已发送。");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
