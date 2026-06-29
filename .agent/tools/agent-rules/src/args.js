const { COMMANDS } = require("./constants");

function parseOptions(args) {
  const options = {};
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const index = arg.indexOf("=");
    if (index === -1) {
      options[toCamelCase(arg.slice(2))] = true;
      continue;
    }
    options[toCamelCase(arg.slice(2, index))] = arg.slice(index + 1);
  }
  return options;
}

function getTargets(args) {
  const targetArg = args.find((arg) => arg.startsWith("--target="));
  const raw = targetArg ? targetArg.slice("--target=".length) : "all";
  const supported = ["qoder", "cursor"];
  if (raw === "all" || raw === "auto") return new Set(["qoder", "cursor"]);
  const selected = raw.split(",").map((item) => item.trim()).filter(Boolean);
  const normalized = [];
  for (const target of selected) {
    if (!supported.includes(target)) throw new Error(`当前命令暂不支持目标：${target}。AGENTS.md/CLAUDE.md 请使用 init 生成。`);
    normalized.push(target);
  }
  return new Set(normalized);
}

function isHelpCommand(command) {
  return command === "help" || command === "--help" || command === "-h";
}

function isKnownCommand(command) {
  return COMMANDS.has(command);
}

function printHelp() {
  console.log(`用法：
  node .agent/tools/agent-rules/cli.js init [--agents=codex,claude,cursor,qoder --name=张三 --github-user=zhangsan --github-email=zhangsan@users.noreply.github.com]
  node .agent/tools/agent-rules/cli.js sync [--target=all|qoder,cursor]
  node .agent/tools/agent-rules/cli.js doctor [--target=all|qoder,cursor]`);
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

module.exports = {
  getTargets,
  isHelpCommand,
  isKnownCommand,
  parseOptions,
  printHelp,
};
