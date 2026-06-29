const readline = require("readline");
const path = require("path");
const { DEFAULT_LANGUAGE, DEFAULT_ROLE, LOCAL_NOTICE } = require("./constants");
const { configureGitAuthor, gitConfig, gitRemoteUrl } = require("./git");
const { renderAll } = require("./render");
const { renderTemplate } = require("./template");
const { findTeamMember, renderCommonConstraints, renderRoleGuide } = require("./team");

async function runInit(repo, options) {
  const profile = await collectInitProfile(repo, options);
  const agents = await collectAgentVendors(options);
  writeLocalEntries(repo, profile, agents, Boolean(options.force));
  syncSelectedVendors(repo, agents);
  configureGitAuthor(repo, profile);
}

async function collectInitProfile(repo, options) {
  const teamMember = findTeamMember(repo, options);
  const defaults = {
    name: gitConfig(repo, "user.name"),
    githubEmail: gitConfig(repo, "user.email"),
    githubUsername: gitConfig(repo, "github.user"),
    role: DEFAULT_ROLE,
    language: DEFAULT_LANGUAGE,
  };
  const profile = {
    name: options.name || teamMember?.name || defaults.name,
    githubUsername: options.githubUsername || options.githubUser || teamMember?.github?.username || defaults.githubUsername,
    githubEmail: options.githubEmail || options.email || teamMember?.github?.email || defaults.githubEmail,
    role: options.role || teamMember?.role || defaults.role,
    language: options.language || defaults.language,
  };

  if (profile.githubEmail && !profile.githubUsername) {
    profile.githubUsername = inferGithubUsername(profile.githubEmail);
  }

  applyMatchedMember(repo, profile, options, teamMember || findTeamMember(repo, profile));

  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      profile.name = await promptMissing(rl, "姓名", profile.name);
      profile.githubUsername = await promptMissing(rl, "GitHub 用户名", profile.githubUsername);
      profile.githubEmail = await promptMissing(rl, "GitHub 提交邮箱", profile.githubEmail);
      profile.role = await promptMissing(rl, "角色", profile.role);
      profile.language = await promptMissing(rl, "常用语言", profile.language);
      if (!options.agents) {
        options.agents = await promptMissing(rl, "Agent 厂商（可多选，逗号分隔）", "codex,claude");
      }
    } finally {
      rl.close();
    }
  }

  applyMatchedMember(repo, profile, options, findTeamMember(repo, profile));
  validateProfile(profile);
  return profile;
}

async function collectAgentVendors(options) {
  const raw = options.agents || "codex,claude";
  return parseAgentVendors(raw);
}

function writeLocalEntries(repo, profile, agents, force) {
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
  repo.writeFileGuarded("AGENTS.md", LOCAL_NOTICE + renderTemplate(repo, ".agent/templates/AGENTS.md.tpl", replacements), force);
  console.log("已生成 AGENTS.md");
  if (agents.has("claude")) {
    repo.writeFileGuarded("CLAUDE.md", LOCAL_NOTICE + renderTemplate(repo, ".agent/templates/CLAUDE.md.tpl", replacements), force);
    console.log("已生成 CLAUDE.md");
  }
}

function syncSelectedVendors(repo, agents) {
  const syncTargets = new Set();
  if (agents.has("cursor")) syncTargets.add("cursor");
  if (agents.has("qoder")) syncTargets.add("qoder");
  if (!syncTargets.size) return;
  for (const output of renderAll(repo, syncTargets)) {
    repo.writeFile(output.path, output.content);
    console.log(`已生成 ${output.path}`);
  }
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

function parseAgentVendors(raw) {
  const supported = new Set(["codex", "claude", "cursor", "qoder"]);
  const aliases = {
    agents: "codex",
    agent: "codex",
    all: "all",
    auto: "all",
  };
  const selected = String(raw)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => aliases[item] || item);
  const normalized = selected.includes("all") ? Array.from(supported) : selected;
  const result = new Set();
  for (const vendor of normalized) {
    if (!supported.has(vendor)) throw new Error(`暂不支持 Agent 厂商：${vendor}。可选：codex, claude, cursor, qoder。`);
    result.add(vendor);
  }
  if (!result.size) throw new Error("至少需要选择一个 Agent 厂商。");
  return result;
}

function applyMatchedMember(repo, profile, options, matchedMember) {
  if (!matchedMember) return;
  profile.name = options.name || matchedMember.name || profile.name;
  profile.githubUsername = options.githubUsername || options.githubUser || matchedMember.github?.username || profile.githubUsername;
  profile.githubEmail = options.githubEmail || options.email || matchedMember.github?.email || profile.githubEmail;
  profile.role = options.role || matchedMember.role || profile.role;
}

function validateProfile(profile) {
  const missing = [];
  if (!profile.name) missing.push("--name");
  if (!profile.githubUsername) missing.push("--github-user");
  if (!profile.githubEmail) missing.push("--github-email");
  if (missing.length) {
    throw new Error(`缺少 init 必填参数：${missing.join(", ")}。示例：node .agent/tools/agent-rules/cli.js init --name=张三 --github-user=zhangsan --github-email=zhangsan@users.noreply.github.com`);
  }
}

function promptMissing(rl, label, currentValue) {
  return new Promise((resolve) => {
    const suffix = currentValue ? ` (${currentValue})` : "";
    rl.question(`${label}${suffix}: `, (answer) => resolve(answer.trim() || currentValue || ""));
  });
}

function inferGithubUsername(email) {
  const match = /^([^@]+)@users\.noreply\.github\.com$/.exec(email);
  if (match) return match[1];
  return "";
}

module.exports = {
  collectAgentVendors,
  collectInitProfile,
  inferRepositoryInfo,
  parseAgentVendors,
  parseGitHubRemote,
  runInit,
  syncSelectedVendors,
  writeLocalEntries,
};
