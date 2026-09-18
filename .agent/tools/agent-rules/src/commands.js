const { RESULT_STATUS } = require("./constants");
const { CliError, logInfo } = require("./output");
const { artifactState, collectStatus, computeArtifacts } = require("./status");
const { isLocalEntryTarget } = require("./targets");

// 仅写入状态非 current 的生成物，保证重复运行不产生无意义变更。
function writeChangedArtifacts(repo, artifacts) {
  const changedFiles = [];
  for (const artifact of artifacts) {
    if (artifact.needsInit) continue; // 身份不完整，交由 init 处理
    if (artifactState(repo, artifact) === "current") continue;
    repo.writeFile(artifact.path, artifact.content);
    changedFiles.push(artifact.path);
    logInfo(`已生成 ${artifact.path}`);
  }
  return changedFiles;
}

// 请求了本地入口目标但身份不完整时，明确报错而非静默跳过。
function assertOperatorResolved(status, targets) {
  const needsLocalEntry = [...targets].some((target) => isLocalEntryTarget(target));
  if (needsLocalEntry && !status.operator.resolved) {
    throw new CliError("无法解析当前操作者身份，不能生成本地入口文件（AGENTS.md / CLAUDE.md）。", {
      code: "config_incomplete",
      exitCode: 2,
      fix: "请运行 agent-rules init 补全身份，或传入 --name/--github-user/--github-email。",
    });
  }
}

function runSync(repo, targets, options = {}) {
  const status = collectStatus(repo, targets, options);
  assertOperatorResolved(status, targets);
  const artifacts = computeArtifacts(repo, targets, status.operator.profile);
  const changedFiles = writeChangedArtifacts(repo, artifacts);
  if (!changedFiles.length) logInfo("生成物已是最新，无需变更。");

  const next = collectStatus(repo, targets, options);
  return {
    repoRoot: repo.root,
    status: RESULT_STATUS.ok,
    exitCode: 0,
    changedFiles,
    operator: next.operator,
    targets: [...targets],
    targetStatus: next.targetStatus,
    artifacts: next.artifacts,
    nextAction: next.nextAction,
  };
}

function runDoctor(repo, targets, options = {}) {
  const status = collectStatus(repo, targets, options);
  const stale = status.artifacts.filter((item) => item.state !== "current");
  const passed = stale.length === 0;

  if (passed) {
    logInfo("生成物检查通过");
  } else {
    // 人类可读诊断走 stderr（logInfo 在 JSON 模式下也会走 stderr）。
    logInfo("生成物检查发现不一致：");
    for (const item of stale) logInfo(`- ${item.path}: ${formatStaleReason(item.state)}`);
    logInfo("请运行：agent-rules sync");
  }

  return {
    repoRoot: repo.root,
    status: passed ? RESULT_STATUS.ok : RESULT_STATUS.checkFailed,
    exitCode: passed ? 0 : 3,
    check: { passed, stale },
    operator: status.operator,
    targets: [...targets],
    targetStatus: status.targetStatus,
    artifacts: status.artifacts,
    nextAction: status.nextAction,
  };
}

function runStatus(repo, targets, options = {}) {
  const status = collectStatus(repo, targets, options);
  return {
    repoRoot: repo.root,
    status: RESULT_STATUS.ok,
    exitCode: 0,
    sourcesPresent: status.sourcesPresent,
    operator: status.operator,
    targets: [...targets],
    targetStatus: status.targetStatus,
    artifacts: status.artifacts,
    nextAction: status.nextAction,
  };
}

// 幂等入口：缺失则 init，过期则 sync，最新则不动，最后做一致性检查。
async function runEnsure(repo, targets, options, runInit) {
  const actions = [];
  const changedFiles = [];
  let status = collectStatus(repo, targets, options);

  if (status.nextAction === "init") {
    const initResult = await runInit(repo, { ...options, agents: [...targets].join(","), nonInteractive: true });
    actions.push("init");
    changedFiles.push(...initResult.changedFiles);
    status = collectStatus(repo, targets, options);
  }

  if (status.nextAction === "sync") {
    const artifacts = computeArtifacts(repo, targets, status.operator.profile);
    changedFiles.push(...writeChangedArtifacts(repo, artifacts));
    actions.push("sync");
    status = collectStatus(repo, targets, options);
  }

  if (!actions.length) logInfo("规则环境已是最新，无需变更。");

  const stale = status.artifacts.filter((item) => item.state !== "current");
  const passed = stale.length === 0;

  return {
    repoRoot: repo.root,
    status: passed ? (changedFiles.length ? RESULT_STATUS.changed : RESULT_STATUS.current) : RESULT_STATUS.checkFailed,
    exitCode: passed ? 0 : 3,
    actions,
    changedFiles,
    check: { passed, stale },
    operator: status.operator,
    targets: [...targets],
    targetStatus: status.targetStatus,
    artifacts: status.artifacts,
    nextAction: passed ? "none" : status.nextAction,
  };
}

function formatStaleReason(reason) {
  if (reason === "missing") return "文件缺失";
  if (reason === "outdated") return "内容已过期";
  return reason;
}

module.exports = {
  runDoctor,
  runEnsure,
  runStatus,
  runSync,
  writeChangedArtifacts,
};
