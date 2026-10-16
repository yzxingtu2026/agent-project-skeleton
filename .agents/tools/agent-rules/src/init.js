const readline = require("readline");
const { AGENTS_ENTRY_FILE, RESULT_STATUS } = require("./constants");
const { writeChangedArtifacts } = require("./commands");
const { configureGitAuthor } = require("./git");
const { CliError, logInfo } = require("./output");
const { describeMissingFields, resolveOperator } = require("./operator");
const { collectStatus, computeArtifacts } = require("./status");

async function runInit(repo, options) {
  const nonInteractive = Boolean(options.nonInteractive) || !process.stdin.isTTY;
  const profile = nonInteractive
    ? resolveNonInteractiveProfile(repo, options)
    : await collectInteractiveProfile(repo, options);

  guardExistingLocalEntry(repo, Boolean(options.force));

  const artifacts = computeArtifacts(repo, profile);
  const changedFiles = writeChangedArtifacts(repo, artifacts);
  configureGitAuthor(repo, profile);

  const status = collectStatus(repo, options);
  logInfo(`初始化完成，已写入 ${changedFiles.length} 个文件。`);
  return {
    repoRoot: repo.root,
    status: RESULT_STATUS.ok,
    exitCode: 0,
    changedFiles,
    operator: status.operator,
    artifacts: status.artifacts,
    nextAction: status.nextAction,
  };
}

// 非交互：仅依赖显式参数、本地 Git 与 gh 身份；缺字段则结构化报错。
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

  validateProfile(profile);
  return profile;
}

// 未加 --force 时，不覆盖已存在的本地入口文件 AGENTS.md。
function guardExistingLocalEntry(repo, force) {
  if (force) return;
  if (repo.exists(AGENTS_ENTRY_FILE)) {
    throw new CliError(`${AGENTS_ENTRY_FILE} 已存在。如需覆盖，请重新运行 init 并加上 --force。`, {
      code: "error",
      exitCode: 1,
      fix: "agent-rules init --force",
    });
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
