const readline = require("readline");
const { DEFAULT_LANGUAGE, DEFAULT_ROLE } = require("./constants");
const { configureGitAuthor, gitConfig } = require("./git");
const { writeLocalEntries } = require("./local-entries");
const { renderAll } = require("./render");
const { findTeamMember } = require("./team");

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
    throw new Error(`缺少 init 必填参数：${missing.join(", ")}。示例：agent-rules init --name=张三 --github-user=zhangsan --github-email=zhangsan@users.noreply.github.com`);
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
  parseAgentVendors,
  runInit,
  syncSelectedVendors,
};
