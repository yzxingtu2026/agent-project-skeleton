const { DEFAULT_LANGUAGE, DEFAULT_ROLE } = require("./constants");
const { ghIdentity, gitConfig } = require("./git");
const { findTeamMember } = require("./team");

// 缺失字段到 init 参数的映射，用于生成可操作修复提示。
const FIELD_FLAGS = {
  name: "--name",
  githubUsername: "--github-user",
  githubEmail: "--github-email",
};

// 从 GitHub no-reply 邮箱推断用户名。
function inferGithubUsername(email) {
  const match = /^([^@]+)@users\.noreply\.github\.com$/.exec(email || "");
  return match ? match[1] : "";
}

// 统一解析操作者身份，优先级：显式参数 > 团队成员匹配 > 本地 Git 配置 > gh 当前身份。
// 不静默猜测：无法解析的字段进入 missingFields，由调用方决定报错或交互补全。
function resolveOperator(repo, options = {}) {
  const git = {
    name: gitConfig(repo, "user.name"),
    githubUsername: gitConfig(repo, "github.user"),
    githubEmail: gitConfig(repo, "user.email"),
  };

  let githubUsername = options.githubUsername || options.githubUser || git.githubUsername || "";
  let githubEmail = options.githubEmail || options.email || git.githubEmail || "";

  if (githubEmail && !githubUsername) {
    githubUsername = inferGithubUsername(githubEmail);
  }

  let matched = findTeamMember(repo, { githubUsername, githubEmail });

  // 仅在参数与本地 Git 不足以确定身份时才调用 gh，避免无谓的网络/进程开销。
  let gh = { githubUsername: "", githubEmail: "", name: "", available: false };
  if (!matched && (!githubUsername || !githubEmail)) {
    gh = ghIdentity();
    githubUsername = githubUsername || gh.githubUsername;
    githubEmail = githubEmail || gh.githubEmail;
    if (githubEmail && !githubUsername) githubUsername = inferGithubUsername(githubEmail);
    matched = findTeamMember(repo, { githubUsername, githubEmail });
  }

  const profile = {
    name: options.name || matched?.name || git.name || gh.name || "",
    githubUsername: options.githubUsername || options.githubUser || matched?.github?.username || githubUsername,
    githubEmail: options.githubEmail || options.email || matched?.github?.email || githubEmail,
    role: options.role || matched?.role || DEFAULT_ROLE,
    language: options.language || DEFAULT_LANGUAGE,
  };

  const missingFields = [];
  if (!profile.name) missingFields.push("name");
  if (!profile.githubUsername) missingFields.push("githubUsername");
  if (!profile.githubEmail) missingFields.push("githubEmail");

  return {
    profile,
    missingFields,
    matchedMember: Boolean(matched),
    sources: {
      args: Boolean(options.name || options.githubUser || options.githubUsername || options.githubEmail || options.email),
      team: Boolean(matched),
      git: Boolean(git.name || git.githubUsername || git.githubEmail),
      gh: gh.available,
    },
  };
}

// 把缺失字段转成结构化、可操作的错误明细。
function describeMissingFields(missingFields) {
  return missingFields.map((field) => ({ field, flag: FIELD_FLAGS[field] || `--${field}` }));
}

module.exports = {
  describeMissingFields,
  inferGithubUsername,
  resolveOperator,
};
