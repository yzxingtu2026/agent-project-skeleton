const { LOCAL_ENTRY_FILES } = require("./constants");
const { parseProfileFromAgents, renderLocalEntries } = require("./local-entries");
const { resolveOperator } = require("./operator");
const { renderAll } = require("./render");
const { normalizeNewlines } = require("./repo");
const { findTeamMember } = require("./team");
const { isLocalEntryTarget, renderableTargets } = require("./targets");

// 计算目标集合对应的期望生成物（不含状态）。
// profile 为 null 表示身份不完整，本地入口文件无法渲染，标记 needsInit。
function computeArtifacts(repo, targets, profile) {
  const artifacts = [];

  const wantsLocalEntry = [...targets].some((target) => isLocalEntryTarget(target));
  if (wantsLocalEntry) {
    if (profile) {
      const rendered = renderLocalEntries(repo, profile);
      if (targets.has("codex")) artifacts.push({ target: "codex", path: LOCAL_ENTRY_FILES.codex, content: rendered.agents });
      if (targets.has("claude")) artifacts.push({ target: "claude", path: LOCAL_ENTRY_FILES.claude, content: rendered.claude });
    } else {
      if (targets.has("codex")) artifacts.push({ target: "codex", path: LOCAL_ENTRY_FILES.codex, content: null, needsInit: true });
      if (targets.has("claude")) artifacts.push({ target: "claude", path: LOCAL_ENTRY_FILES.claude, content: null, needsInit: true });
    }
  }

  for (const output of renderAll(repo, renderableTargets(targets))) {
    artifacts.push({ target: output.target, path: output.path, content: output.content });
  }

  return artifacts;
}

// 判定单个生成物状态：missing / outdated / current。
function artifactState(repo, artifact) {
  const exists = repo.exists(artifact.path);
  if (artifact.needsInit) return exists ? "outdated" : "missing";
  if (!exists) return "missing";
  const onDisk = normalizeNewlines(repo.readText(artifact.path));
  return onDisk === normalizeNewlines(artifact.content) ? "current" : "outdated";
}

const STATE_PRIORITY = { missing: 0, outdated: 1, current: 2 };

function worstState(states) {
  return states.reduce((worst, state) => (STATE_PRIORITY[state] < STATE_PRIORITY[worst] ? state : worst), "current");
}

// 解析当前操作者身份：已初始化则以 AGENTS.md 为准，否则回退到潜在解析结果。
function resolveOperatorStatus(repo, options) {
  const { profile: parsed, missingFields: parsedMissing, present } = parseProfileFromAgents(repo);
  if (present && !parsedMissing.length) {
    return {
      initialized: true,
      resolved: true,
      name: parsed.name,
      githubUsername: parsed.githubUsername,
      githubEmail: parsed.githubEmail,
      role: parsed.role,
      matchedMember: Boolean(findTeamMember(repo, parsed)),
      missingFields: [],
      profile: parsed,
    };
  }

  const resolved = resolveOperator(repo, options);
  return {
    initialized: present,
    resolved: resolved.missingFields.length === 0,
    name: resolved.profile.name,
    githubUsername: resolved.profile.githubUsername,
    githubEmail: resolved.profile.githubEmail,
    role: resolved.profile.role,
    matchedMember: resolved.matchedMember,
    missingFields: resolved.missingFields,
    sources: resolved.sources,
    profile: resolved.missingFields.length === 0 ? resolved.profile : null,
  };
}

// 汇总仓库、操作者、各 target 的状态，并给出推荐的下一步动作。
function collectStatus(repo, targets, options = {}) {
  const operator = resolveOperatorStatus(repo, options);
  const artifacts = computeArtifacts(repo, targets, operator.profile);

  const artifactReports = [];
  const byTarget = new Map();
  for (const artifact of artifacts) {
    const state = artifactState(repo, artifact);
    artifactReports.push({ target: artifact.target, path: artifact.path, state });
    if (!byTarget.has(artifact.target)) byTarget.set(artifact.target, []);
    byTarget.get(artifact.target).push(state);
  }

  const targetStatus = [...targets].map((target) => ({
    target,
    state: byTarget.has(target) ? worstState(byTarget.get(target)) : "current",
    artifacts: artifactReports.filter((item) => item.target === target),
  }));

  return {
    sourcesPresent: repo.exists(".agent/rules") && repo.exists(".agent/adapters"),
    operator,
    artifacts: artifactReports,
    targetStatus,
    nextAction: decideNextAction(repo, targets, operator, targetStatus),
  };
}

function decideNextAction(repo, targets, operator, targetStatus) {
  if (!operator.resolved) return "init";
  const needsLocalEntry = [...targets].some((target) => isLocalEntryTarget(target));
  if (needsLocalEntry && !repo.exists(LOCAL_ENTRY_FILES.codex)) return "init";
  const hasChanges = targetStatus.some((item) => item.state !== "current");
  return hasChanges ? "sync" : "none";
}

module.exports = {
  artifactState,
  collectStatus,
  computeArtifacts,
  worstState,
};
