const { AGENTS_ENTRY_FILE } = require("./constants");
const { parseProfileFromAgents, renderLocalEntries } = require("./local-entries");
const { resolveOperator } = require("./operator");
const { normalizeNewlines } = require("./repo");

// 计算期望生成物：仓库根唯一的跨工具入口 AGENTS.md。
// profile 为 null 表示身份不完整，无法渲染，标记 needsInit 交由 init 处理。
function computeArtifacts(repo, profile) {
  if (profile) {
    const rendered = renderLocalEntries(repo, profile);
    return [{ path: AGENTS_ENTRY_FILE, content: rendered.agents }];
  }
  return [{ path: AGENTS_ENTRY_FILE, content: null, needsInit: true }];
}

// 判定单个生成物状态：missing / outdated / current。
function artifactState(repo, artifact) {
  const exists = repo.exists(artifact.path);
  if (artifact.needsInit) return exists ? "outdated" : "missing";
  if (!exists) return "missing";
  const onDisk = normalizeNewlines(repo.readText(artifact.path));
  return onDisk === normalizeNewlines(artifact.content) ? "current" : "outdated";
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
    missingFields: resolved.missingFields,
    sources: resolved.sources,
    profile: resolved.missingFields.length === 0 ? resolved.profile : null,
  };
}

// 汇总仓库、操作者与生成物状态，并给出推荐的下一步动作。
function collectStatus(repo, options = {}) {
  const operator = resolveOperatorStatus(repo, options);
  const artifacts = computeArtifacts(repo, operator.profile);

  const artifactReports = artifacts.map((artifact) => ({
    path: artifact.path,
    state: artifactState(repo, artifact),
  }));

  return {
    sourcesPresent: repo.exists(".agents/templates/AGENTS.md.tpl"),
    operator,
    artifacts: artifactReports,
    nextAction: decideNextAction(repo, operator, artifactReports),
  };
}

function decideNextAction(repo, operator, artifactReports) {
  if (!operator.resolved) return "init";
  if (!repo.exists(AGENTS_ENTRY_FILE)) return "init";
  const hasChanges = artifactReports.some((item) => item.state !== "current");
  return hasChanges ? "sync" : "none";
}

module.exports = {
  artifactState,
  collectStatus,
  computeArtifacts,
};
