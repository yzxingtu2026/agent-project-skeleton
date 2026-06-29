const readline = require("readline");
const { DEFAULT_LANGUAGE, DEFAULT_ROLE, LOCAL_NOTICE } = require("./constants");
const { configureGitAuthor, gitConfig } = require("./git");
const { renderTemplate } = require("./template");
const { findTeamMember, renderCommonConstraints, renderRoleGuide } = require("./team");

async function runInit(repo, options) {
  const profile = await collectInitProfile(repo, options);
  writeLocalEntries(repo, profile, Boolean(options.force));
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
    } finally {
      rl.close();
    }
  }

  applyMatchedMember(repo, profile, options, findTeamMember(repo, profile));
  validateProfile(profile);
  return profile;
}

function writeLocalEntries(repo, profile, force) {
  const replacements = {
    USER_NAME: profile.name,
    GITHUB_USERNAME: profile.githubUsername,
    GITHUB_EMAIL: profile.githubEmail,
    USER_ROLE: profile.role,
    USER_LANGUAGE: profile.language,
    USER_ROLE_GUIDE: renderRoleGuide(repo, profile.role),
    ROLE_COMMON_CONSTRAINTS: renderCommonConstraints(repo),
  };
  repo.writeFileGuarded("AGENTS.md", LOCAL_NOTICE + renderTemplate(repo, ".agent/templates/AGENTS.md.tpl", replacements), force);
  repo.writeFileGuarded("CLAUDE.md", LOCAL_NOTICE + renderTemplate(repo, ".agent/templates/CLAUDE.md.tpl", replacements), force);
  console.log("initialized AGENTS.md and CLAUDE.md");
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
    throw new Error(`Missing required init options: ${missing.join(", ")}. Example: node .agent/tools/agent-rules/cli.js init --name=张三 --github-user=zhangsan --github-email=zhangsan@users.noreply.github.com`);
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
  collectInitProfile,
  runInit,
  writeLocalEntries,
};
