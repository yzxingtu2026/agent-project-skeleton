const path = require("path");
const { DEFAULT_LANGUAGE, DEFAULT_ROLE, LOCAL_NOTICE, PLATFORM_LABELS, PLATFORM_UNKNOWN_LABEL } = require("./constants");
const { gitRemoteUrl } = require("./git");
const { renderTemplate } = require("./template");

function renderLocalEntries(repo, profile) {
  const repository = inferRepositoryInfo(repo);
  const replacements = {
    PROJECT_NAME: repository.projectName,
    PLATFORM: repository.platform,
    REPOSITORY_URL: repository.repositoryUrl,
    USER_NAME: profile.name,
    PLATFORM_USERNAME: profile.githubUsername,
    COMMIT_EMAIL: profile.githubEmail,
    USER_ROLE: profile.role,
    USER_LANGUAGE: profile.language,
  };
  return {
    agents: LOCAL_NOTICE + renderTemplate(repo, ".agents/templates/AGENTS.md.tpl", replacements),
  };
}

function readProfileFromAgents(repo) {
  const { profile, missingFields } = parseProfileFromAgents(repo);
  if (missingFields.length) {
    throw new Error("AGENTS.md 中缺少当前使用者信息。请重新运行 agent-rules init。");
  }
  return profile;
}

// 非抛错版本：解析 AGENTS.md 中的操作者身份，返回缺失字段列表。
// 供 status/ensure 判断初始化状态与身份完整性。
function parseProfileFromAgents(repo) {
  const profile = {
    name: "",
    githubUsername: "",
    githubEmail: "",
    role: DEFAULT_ROLE,
    language: DEFAULT_LANGUAGE,
  };
  if (!repo.exists("AGENTS.md")) {
    return { profile, missingFields: ["name", "githubUsername", "githubEmail"], present: false };
  }
  const content = repo.readText("AGENTS.md");
  const fields = {
    "姓名": "name",
    "平台用户名": "githubUsername",
    "提交邮箱": "githubEmail",
    "角色": "role",
    "常用语言": "language",
  };

  for (const line of content.split(/\r?\n/)) {
    const match = /^-\s+\*\*(.+?)\*\*：(.+)$/.exec(line.trim());
    if (!match) continue;
    const key = fields[match[1]];
    if (!key) continue;
    profile[key] = stripInlineCode(match[2].trim());
  }

  const missingFields = [];
  if (!profile.name) missingFields.push("name");
  if (!profile.githubUsername) missingFields.push("githubUsername");
  if (!profile.githubEmail) missingFields.push("githubEmail");

  return { profile, missingFields, present: true };
}

function inferRepositoryInfo(repo) {
  const remoteUrl = gitRemoteUrl(repo, "origin");
  const parsed = parseRemote(remoteUrl);
  return {
    projectName: parsed?.repo || path.basename(repo.root),
    repositoryUrl: parsed?.url || remoteUrl || "https://<HOST>/<OWNER>/<REPO>",
    platform: parsed ? PLATFORM_LABELS[parsed.platform] : PLATFORM_UNKNOWN_LABEL,
    platformKey: parsed?.platform || "",
    host: parsed?.host || "",
  };
}

// 解析任意 Git 远端（GitHub / 自建 Gitea / 其它），返回 host、owner、repo、规范 URL 与平台键。
// 支持 scheme 形式（https/http/ssh/git://，可含 user@、端口）与 scp 形式（[user@]host:owner/repo）。
function parseRemote(remoteUrl) {
  if (!remoteUrl) return null;
  const s = remoteUrl.trim();

  let scheme = "";
  let host = "";
  let pathname = "";

  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/]+@)?([^:/]+)(?::\d+)?\/(.+)$/i.exec(s);
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
    host = schemeMatch[2];
    pathname = schemeMatch[3];
  } else {
    const scpMatch = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(s);
    if (!scpMatch) return null;
    host = scpMatch[1];
    pathname = scpMatch[2];
  }

  const clean = pathname.replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[parts.length - 2];
  const repo = parts[parts.length - 1];
  const webScheme = scheme === "ssh" || scheme === "git" || !scheme ? "https" : scheme;
  return {
    host,
    owner,
    repo,
    url: `${webScheme}://${host}/${owner}/${repo}`,
    platform: host.toLowerCase() === "github.com" ? "github" : "gitea",
  };
}

function stripInlineCode(value) {
  const match = /^`(.+)`$/.exec(value);
  return match ? match[1] : value;
}

module.exports = {
  inferRepositoryInfo,
  parseProfileFromAgents,
  parseRemote,
  readProfileFromAgents,
  renderLocalEntries,
};
