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

function isHelpCommand(command) {
  return command === "help" || command === "--help" || command === "-h";
}

function isKnownCommand(command) {
  return COMMANDS.has(command);
}

function printHelp() {
  console.log(`用法：
  agent-rules init    [--non-interactive] [--name=张三 --github-user=zhangsan --github-email=zhangsan@users.noreply.github.com] [--force] [--json]
  agent-rules sync    [--json]
  agent-rules doctor  [--json]
  agent-rules status  [--json]
  agent-rules ensure  [--non-interactive] [--json]

说明：
  规则与技能统一维护在仓库根的 .agents/ 目录，不再扇出各厂商专属规则。
  本工具只生成跨工具通用入口 AGENTS.md（含操作者身份，已被 Git 忽略），并配置本仓库 Git author。
  「代码平台」由 origin 远端 host 自动推导：github.com → GitHub（用 gh），其它 → Gitea（用 tea）。
  --github-user/--github-email 为平台无关的身份旗标（平台用户名 / 提交邮箱），GitHub 与自建 Gitea 通用。
  --json 时 stdout 只输出最终 JSON，人类可读日志改走 stderr。

退出码：
  0 成功（含无需变更）  1 未预期错误  2 配置/身份不完整  3 校验或一致性检查未通过

本地开发可用：node .agents/tools/agent-rules/cli.js <命令>`);
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
