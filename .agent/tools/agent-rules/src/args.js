const { COMMANDS, VENDORS } = require("./constants");

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

function isHelpCommand(command) {
  return command === "help" || command === "--help" || command === "-h";
}

function isKnownCommand(command) {
  return COMMANDS.has(command);
}

function printHelp() {
  const vendors = VENDORS.join(",");
  console.log(`用法：
  agent-rules init    [--agents=${vendors}] [--non-interactive] [--name=张三 --github-user=zhangsan --github-email=zhangsan@users.noreply.github.com] [--force] [--json]
  agent-rules sync    [--target=${vendors}|all] [--json]
  agent-rules doctor  [--target=${vendors}|all] [--json]
  agent-rules status  [--agents=${vendors}|all] [--json]
  agent-rules ensure  [--agents=${vendors}|all] [--non-interactive] [--json]

说明：
  --agents 与 --target 共用同一套厂商命名（codex/claude/cursor/qoder）。
  codex 管理根目录 AGENTS.md，claude 管理 CLAUDE.md，cursor/qoder 管理各自规则与技能目录。
  --json 时 stdout 只输出最终 JSON，人类可读日志改走 stderr。

退出码：
  0 成功（含无需变更）  1 未预期错误  2 配置/身份不完整  3 校验或一致性检查未通过

本地开发可用：node .agent/tools/agent-rules/cli.js <命令>`);
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

module.exports = {
  isHelpCommand,
  isKnownCommand,
  parseOptions,
  printHelp,
};
