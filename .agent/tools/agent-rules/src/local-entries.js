const path = require("path");
const { DEFAULT_LANGUAGE, DEFAULT_ROLE, LOCAL_NOTICE } = require("./constants");
const { gitRemoteUrl } = require("./git");
const { renderTemplate } = require("./template");
const { findTeamMember, renderCommonConstraints, renderRoleGuide } = require("./team");

function writeLocalEntries(repo, profile, agents, force) {
  const rendered = renderLocalEntries(repo, profile);
  repo.writeFileGuarded("AGENTS.md", rendered.agents, force);
  console.log("已生成 AGENTS.md");
  if (agents.has("claude")) {
    repo.writeFileGuarded("CLAUDE.md", rendered.claude, force);
    console.log("已生成 CLAUDE.md");
  }
}

function refreshLocalEntries(repo) {
  if (!repo.exists("AGENTS.md")) {
    throw new Error("未发现 AGENTS.md。请先运行 agent-rules init 配置当前使用者，再运行 sync。");
  }

  const profile = readProfileFromAgents(repo);
  const rendered = renderLocalEntries(repo, profile);
  repo.writeFile("AGENTS.md", rendered.agents);
  console.log("已刷新 AGENTS.md");

  if (repo.exists("CLAUDE.md")) {
    repo.writeFile("CLAUDE.md", rendered.claude);
    console.log("已刷新 CLAUDE.md");
  }
}

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
  const profile = {
    name: "",
    githubUsername: "",
    githubEmail: "",
    role: DEFAULT_ROLE,
    language: DEFAULT_LANGUAGE,
  };
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

  if (!profile.name || !profile.githubUsername || !profile.githubEmail) {
    throw new Error("AGENTS.md 中缺少当前使用者信息。请重新运行 agent-rules init。");
  }

  const matchedMember = findTeamMember(repo, profile);
  if (matchedMember) {
    profile.role = matchedMember.role || profile.role;
  }
  return profile;
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
  readProfileFromAgents,
  refreshLocalEntries,
  renderLocalEntries,
  writeLocalEntries,
};
