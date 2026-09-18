const readline = require("readline");
const { LOCAL_ENTRY_FILES, RESULT_STATUS } = require("./constants");
const { writeChangedArtifacts } = require("./commands");
const { configureGitAuthor } = require("./git");
const { CliError, logInfo } = require("./output");
const { describeMissingFields, resolveOperator } = require("./operator");
const { collectStatus, computeArtifacts } = require("./status");
const { findTeamMember } = require("./team");
const { isLocalEntryTarget, parseVendorList } = require("./targets");

const DEFAULT_INIT_TARGETS = "codex,claude";

async function runInit(repo, options) {
  const nonInteractive = Boolean(options.nonInteractive) || !process.stdin.isTTY;
  const targets = await resolveInitTargets(repo, options, nonInteractive);
  const profile = nonInteractive
    ? resolveNonInteractiveProfile(repo, options)
    : await collectInteractiveProfile(repo, options);

  guardExistingLocalEntries(repo, targets, Boolean(options.force));

  const artifacts = computeArtifacts(repo, targets, profile);
  const changedFiles = writeChangedArtifacts(repo, artifacts);
  configureGitAuthor(repo, profile);

  const status = collectStatus(repo, targets, options);
  logInfo(`初始化完成，已写入 ${changedFiles.length} 个文件。`);
  return {
    repoRoot: repo.root,
    status: RESULT_STATUS.ok,
    exitCode: 0,
    changedFiles,
    operator: status.operator,
    targets: [...targets],
    targetStatus: status.targetStatus,
    artifacts: status.artifacts,
    nextAction: status.nextAction,
  };
}

async function resolveInitTargets(repo, options, nonInteractive) {
  if (!options.agents && !nonInteractive && process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      options.agents = await promptMissing(rl, "Agent 厂商（可多选，逗号分隔）", DEFAULT_INIT_TARGETS);
    } finally {
      rl.close();
    }
  }
  return parseVendorList(options.agents || DEFAULT_INIT_TARGETS);
}

// 非交互：仅依赖显式参数、团队成员匹配、本地 Git 与 gh 身份；缺字段则结构化报错。
function resolveNonInteractiveProfile(repo, options) {
  const { profile, missingFields } = resolveOperator(repo, options);
  if (missingFields.length) {
    const fields = describeMissingFields(missingFields);
    throw new CliError(`非交互 init 缺少必填身份信息：${missingFields.join(", ")}。`, {
      code: "config_incomplete",
      exitCode: 2,
      fix: `请补齐参数 ${fields.map((item) => item.flag).join(" ")}，或确保本地 git config 与 gh 登录身份可用。`,
      details: { missingFields: fields },
    });
  }
  return profile;
}

// 交互：以解析结果为默认值，逐项补全，保持原有人工使用方式。
async function collectInteractiveProfile(repo, options) {
  const { profile } = resolveOperator(repo, options);

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

  const matched = findTeamMember(repo, profile);
  if (matched) {
    profile.name = options.name || matched.name || profile.name;
    profile.githubUsername = options.githubUsername || options.githubUser || matched.github?.username || profile.githubUsername;
    profile.githubEmail = options.githubEmail || options.email || matched.github?.email || profile.githubEmail;
    profile.role = options.role || matched.role || profile.role;
  }

  validateProfile(profile);
  return profile;
}

// 未加 --force 时，不覆盖已存在的本地入口文件。
function guardExistingLocalEntries(repo, targets, force) {
  if (force) return;
  for (const target of targets) {
    if (!isLocalEntryTarget(target)) continue;
    const file = LOCAL_ENTRY_FILES[target];
    if (repo.exists(file)) {
      throw new CliError(`${file} 已存在。如需覆盖，请重新运行 init 并加上 --force。`, {
        code: "error",
        exitCode: 1,
        fix: `agent-rules init --force --agents=${[...targets].join(",")}`,
      });
    }
  }
}

function validateProfile(profile) {
  const missingFields = [];
  if (!profile.name) missingFields.push("name");
  if (!profile.githubUsername) missingFields.push("githubUsername");
  if (!profile.githubEmail) missingFields.push("githubEmail");
  if (!missingFields.length) return;
  const fields = describeMissingFields(missingFields);
  throw new CliError(`缺少 init 必填身份信息：${missingFields.join(", ")}。`, {
    code: "config_incomplete",
    exitCode: 2,
    fix: `示例：agent-rules init --name=张三 --github-user=zhangsan --github-email=zhangsan@users.noreply.github.com`,
    details: { missingFields: fields },
  });
}

function promptMissing(rl, label, currentValue) {
  return new Promise((resolve) => {
    const suffix = currentValue ? ` (${currentValue})` : "";
    rl.question(`${label}${suffix}: `, (answer) => resolve(answer.trim() || currentValue || ""));
  });
}

module.exports = {
  runInit,
};
