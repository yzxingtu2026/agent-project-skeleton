const { LOCAL_ENTRY_FILES, VENDORS } = require("./constants");
const { CliError } = require("./output");

const VENDOR_ALIASES = {
  agents: "codex",
  agent: "codex",
  all: "all",
  auto: "all",
};

// 从 --agents / --target 参数解析目标集合；二者共用同一套厂商命名。
// allowEmpty=true 时（status/ensure）不抛错，返回空集合交由调用方判断。
function resolveTargets(repo, options, { allowEmpty = false } = {}) {
  const raw = firstDefined(options.agents, options.target);
  if (raw === undefined || raw === "" || raw === true) {
    const inferred = inferExistingTargets(repo);
    if (inferred.size || allowEmpty) return inferred;
    throw new CliError("未发现已初始化的厂商目录或本地入口文件。", {
      code: "config_incomplete",
      exitCode: 2,
      fix: "请先运行 agent-rules init，或显式指定：agent-rules sync --target=codex,qoder",
    });
  }
  return parseVendorList(raw);
}

// 解析逗号分隔的厂商列表，支持 all/auto 展开为全部厂商。
function parseVendorList(raw) {
  const selected = String(raw)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => VENDOR_ALIASES[item] || item);
  const normalized = selected.includes("all") ? [...VENDORS] : selected;
  const result = new Set();
  for (const vendor of normalized) {
    if (!VENDORS.includes(vendor)) {
      throw new CliError(`暂不支持的 Agent 目标：${vendor}。`, {
        code: "config_incomplete",
        exitCode: 2,
        fix: `可选目标：${VENDORS.join(", ")}，或 all。`,
      });
    }
    result.add(vendor);
  }
  if (!result.size) {
    throw new CliError("至少需要选择一个 Agent 目标。", { code: "config_incomplete", exitCode: 2 });
  }
  return result;
}

// 根据仓库现有生成物推断目标：本地入口文件 + 厂商目录。
function inferExistingTargets(repo) {
  const targets = new Set();
  for (const vendor of Object.keys(LOCAL_ENTRY_FILES)) {
    if (repo.exists(LOCAL_ENTRY_FILES[vendor])) targets.add(vendor);
  }
  if (repo.exists(".qoder")) targets.add("qoder");
  if (repo.exists(".cursor")) targets.add("cursor");
  return targets;
}

// 该 target 的生成物是否依赖操作者身份（本地入口文件）。
function isLocalEntryTarget(target) {
  return Object.prototype.hasOwnProperty.call(LOCAL_ENTRY_FILES, target);
}

// 需要渲染规则/技能目录的目标（非本地入口）。
function renderableTargets(targets) {
  return new Set([...targets].filter((target) => !isLocalEntryTarget(target)));
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

module.exports = {
  inferExistingTargets,
  isLocalEntryTarget,
  parseVendorList,
  renderableTargets,
  resolveTargets,
};
