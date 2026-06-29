const { getTargets, isHelpCommand, isKnownCommand, parseOptions, printHelp } = require("./args");
const { runDoctor, runSync } = require("./commands");
const { runInit } = require("./init");
const { createRepo, ensureAgentWorkspace, findRepoRoot } = require("./repo");
const { validateSources } = require("./validate");

async function runCli(argv) {
  const command = argv[2] || "help";
  if (!isKnownCommand(command)) {
    printHelp();
    process.exit(isHelpCommand(command) ? 0 : 1);
  }

  const args = argv.slice(3);
  const repo = createRepo(findRepoRoot(process.cwd()));
  ensureAgentWorkspace(repo);
  validateSources(repo);

  if (command === "init") {
    await runInit(repo, parseOptions(args));
    return;
  }

  const targets = getTargets(args);
  if (command === "sync") runSync(repo, targets);
  if (command === "doctor") runDoctor(repo, targets);
}

module.exports = {
  runCli,
};
