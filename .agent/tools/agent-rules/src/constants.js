const GENERATED_NOTICE = "<!-- 由 .agent/tools/agent-rules 生成。请修改 .agent/rules/、.agent/skills/、.agent/team/、.agent/adapters/、.agent/templates/ 下的源文件。 -->\n\n";
const LOCAL_NOTICE = "<!-- 由 agent-rules 生成。本地文件已被 Git 忽略；如需更换身份信息，请重新运行 init。 -->\n\n";
const COMMANDS = new Set(["init", "sync", "doctor", "status", "ensure"]);
const DEFAULT_LANGUAGE = "简体中文";
const DEFAULT_ROLE = "全栈开发";

// 机器可读输出的 schema 版本，字段结构变化时递增。
const SCHEMA_VERSION = "1.0";

// 稳定退出码：调用方（含自动化 Agent）依赖这些数值判断结果。
const EXIT_CODES = {
  ok: 0, // 成功，包含“已执行变更”和“无需变更”
  error: 1, // 未预期错误，例如缺少 .agent 工作区
  configIncomplete: 2, // 操作者身份或必填配置不完整
  checkFailed: 3, // 源校验失败或生成物一致性检查未通过
};

// 结果状态，与退出码对应，写入 JSON 的 status 字段。
const RESULT_STATUS = {
  ok: "ok",
  changed: "changed",
  current: "current",
  configIncomplete: "config_incomplete",
  checkFailed: "check_failed",
  error: "error",
};

// 受支持的 Agent 厂商 / 同步目标，二者共用同一套命名。
const VENDORS = ["codex", "claude", "cursor", "qoder"];

// 本地入口文件：这些 target 的生成物依赖操作者身份，位于仓库根目录。
const LOCAL_ENTRY_FILES = {
  codex: "AGENTS.md",
  claude: "CLAUDE.md",
};

module.exports = {
  COMMANDS,
  DEFAULT_LANGUAGE,
  DEFAULT_ROLE,
  EXIT_CODES,
  GENERATED_NOTICE,
  LOCAL_ENTRY_FILES,
  LOCAL_NOTICE,
  RESULT_STATUS,
  SCHEMA_VERSION,
  VENDORS,
};
