const { isHelpCommand, isKnownCommand, parseOptions, printHelp } = require("./args");
const { runDoctor, runEnsure, runStatus, runSync } = require("./commands");
const { runInit } = require("./init");
const { CliError, logError, setJsonMode } = require("./output");
const { errorResult, report } = require("./report");
const { createRepo, ensureAgentWorkspace, findRepoRoot } = require("./repo");

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

    const result = await dispatch(command, repo, options);
    return report(command, result);
  } catch (error) {
    if (!(error instanceof CliError)) logError(error.message);
    return report(command, errorResult(repoRoot, error));
  }
}

async function dispatch(command, repo, options) {
  if (command === "init") return runInit(repo, options);
  if (command === "status") return runStatus(repo, options);
  if (command === "ensure") return runEnsure(repo, options, runInit);
  if (command === "sync") return runSync(repo, options);
  return runDoctor(repo, options);
}

module.exports = {
  runCli,
};
