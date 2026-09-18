const path = require("path");
const { DEFAULT_LANGUAGE, DEFAULT_ROLE, LOCAL_NOTICE } = require("./constants");
const { gitRemoteUrl } = require("./git");
const { renderTemplate } = require("./template");
const { findTeamMember, renderCommonConstraints, renderRoleGuide } = require("./team");

function renderLocalEntries(repo, profile) {
  const repository = inferRepositoryInfo(repo);
  const replacements = {
    PROJECT_NAME: repository.projectName,
    GITHUB_REPOSITORY: repository.githubRepository,
    USER_NAME: profile.name,
    GITHUB_USERNAME: profile.githubUsername,
    GITHUB_EMAIL: profile.githubEmail,
    USER_ROLE: profile.role,
    USER_LANGUAGE: profile.language,
    USER_ROLE_GUIDE: renderRoleGuide(repo, profile.role),
    ROLE_COMMON_CONSTRAINTS: renderCommonConstraints(repo),
  };
  return {
    agents: LOCAL_NOTICE + renderTemplate(repo, ".agent/templates/AGENTS.md.tpl", replacements),
    claude: LOCAL_NOTICE + renderTemplate(repo, ".agent/templates/CLAUDE.md.tpl", replacements),
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
    "GitHub 用户名": "githubUsername",
    "GitHub 提交邮箱": "githubEmail",
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

  if (!missingFields.length) {
    const matchedMember = findTeamMember(repo, profile);
    if (matchedMember) {
      profile.role = matchedMember.role || profile.role;
    }
  }
  return { profile, missingFields, present: true };
}

function inferRepositoryInfo(repo) {
  const remoteUrl = gitRemoteUrl(repo, "origin");
  const parsed = parseGitHubRemote(remoteUrl);
  return {
    projectName: parsed?.repo || path.basename(repo.root),
    githubRepository: parsed?.url || remoteUrl || "https://github.com/<OWNER>/<REPO>",
  };
}

function parseGitHubRemote(remoteUrl) {
  if (!remoteUrl) return null;
  const normalized = remoteUrl.trim();
  const patterns = [
    /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
    /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/,
    /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (!match) continue;
    return {
      owner: match[1],
      repo: match[2],
      url: `https://github.com/${match[1]}/${match[2]}`,
    };
  }
  return null;
}

function stripInlineCode(value) {
  const match = /^`(.+)`$/.exec(value);
  return match ? match[1] : value;
}

module.exports = {
  inferRepositoryInfo,
  parseGitHubRemote,
  parseProfileFromAgents,
  readProfileFromAgents,
  renderLocalEntries,
};
