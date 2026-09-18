const { isHelpCommand, isKnownCommand, parseOptions, printHelp } = require("./args");
const { runDoctor, runEnsure, runStatus, runSync } = require("./commands");
const { runInit } = require("./init");
const { CliError, logError, setJsonMode } = require("./output");
const { errorResult, report } = require("./report");
const { createRepo, ensureAgentWorkspace, findRepoRoot } = require("./repo");
const { resolveTargets } = require("./targets");
const { validateSources } = require("./validate");

// status/ensure 未指定目标且无既有生成物时，以通用入口 codex(AGENTS.md) 为默认基线。
const DEFAULT_ENSURE_TARGETS = new Set(["codex"]);

async function runCli(argv) {
  const command = argv[2] || "help";
  if (!isKnownCommand(command)) {
    printHelp();
    return isHelpCommand(command) ? 0 : 1;
  }

  const options = parseOptions(argv.slice(3));
  setJsonMode(Boolean(options.json));
  const repoRoot = findRepoRoot(process.cwd());

  try {
    const repo = createRepo(repoRoot);
    ensureAgentWorkspace(repo);
    validateSources(repo);

    const result = await dispatch(command, repo, options);
    return report(command, result);
  } catch (error) {
    if (!(error instanceof CliError)) logError(error.message);
    return report(command, errorResult(repoRoot, error));
  }
}

async function dispatch(command, repo, options) {
  if (command === "init") return runInit(repo, options);

  if (command === "status" || command === "ensure") {
    const inferred = resolveTargets(repo, options, { allowEmpty: true });
    const targets = inferred.size ? inferred : new Set(DEFAULT_ENSURE_TARGETS);
    if (command === "status") return runStatus(repo, targets, options);
    return runEnsure(repo, targets, options, runInit);
  }

  const targets = resolveTargets(repo, options);
  if (command === "sync") return runSync(repo, targets, options);
  return runDoctor(repo, targets, options);
}

module.exports = {
  runCli,
};
