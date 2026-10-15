const { SCHEMA_VERSION } = require("./constants");
const { emitJson, isJsonMode, logInfo } = require("./output");
const pkg = require("../package.json");

// 去掉内部字段（profile/sources 中的敏感或冗余数据），输出稳定的操作者结构。
function publicOperator(operator) {
  if (!operator) return undefined;
  const { profile, ...rest } = operator;
  void profile;
  return rest;
}

// 把命令结果组装成带版本的机器可读载荷。
function buildPayload(command, result) {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    cliVersion: pkg.version,
    command,
    status: result.status,
    repoRoot: result.repoRoot,
  };
  if (result.sourcesPresent !== undefined) payload.sourcesPresent = result.sourcesPresent;
  if (result.targets) payload.targets = result.targets;
  if (result.operator) payload.operator = publicOperator(result.operator);
  if (result.targetStatus) payload.targetStatus = result.targetStatus;
  if (result.artifacts) payload.artifacts = result.artifacts;
  if (result.nextAction !== undefined) payload.nextAction = result.nextAction;
  if (result.actions) payload.actions = result.actions;
  if (result.changedFiles) payload.changedFiles = result.changedFiles;
  if (result.check) payload.check = result.check;
  if (result.errors && result.errors.length) payload.errors = result.errors;
  return payload;
}

// 输出结果：JSON 模式写 stdout JSON；普通模式写人类可读摘要。返回退出码。
function report(command, result) {
  if (isJsonMode()) {
    emitJson(buildPayload(command, result));
    return result.exitCode || 0;
  }
  printHumanSummary(command, result);
  return result.exitCode || 0;
}

function printHumanSummary(command, result) {
  if (command === "status") {
    const operator = result.operator || {};
    logInfo(`操作者：${operator.resolved ? `${operator.name}（${operator.githubUsername}）` : "未解析"}`);
    for (const item of result.targetStatus || []) logInfo(`- ${item.target}: ${item.state}`);
    logInfo(`推荐下一步：${result.nextAction}`);
    return;
  }
  if (command === "ensure") {
    logInfo(`执行动作：${(result.actions || []).join(", ") || "无"}`);
    if (result.changedFiles && result.changedFiles.length) logInfo(`变更文件：${result.changedFiles.join(", ")}`);
    logInfo(result.check && result.check.passed ? "一致性检查通过" : "一致性检查未通过");
    return;
  }
  if (command === "sync" || command === "init") {
    logInfo(`变更文件：${(result.changedFiles || []).join(", ") || "无"}`);
  }
}

// 把异常转成结构化错误结果，保证 JSON 模式下也有稳定输出。
// CliError 的 code 与 RESULT_STATUS 取值一致，可直接作为 status。
function errorResult(repoRoot, error) {
  const cliError = error && error.code ? error : null;
  return {
    repoRoot,
    status: cliError ? cliError.code : "error",
    exitCode: cliError ? cliError.exitCode : 1,
    errors: [
      cliError
        ? cliError.toJSON()
        : { code: "error", message: error?.message || String(error), fix: "" },
    ],
  };
}

module.exports = {
  buildPayload,
  errorResult,
  report,
};
