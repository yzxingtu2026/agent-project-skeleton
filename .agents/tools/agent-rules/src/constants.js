const LOCAL_NOTICE = "<!-- 由 agent-rules 生成。本地文件已被 Git 忽略；如需更换身份信息，请重新运行 init。 -->\n\n";
const COMMANDS = new Set(["init", "sync", "doctor", "status", "ensure"]);
const DEFAULT_LANGUAGE = "简体中文";
const DEFAULT_ROLE = "全栈开发";

// 仓库根唯一的跨工具入口文件，由本工具生成，包含操作者身份，已被 Git 忽略。
const AGENTS_ENTRY_FILE = "AGENTS.md";

// 机器可读输出的 schema 版本，字段结构变化时递增。
// 2.0：移除厂商扇出（targets/targetStatus），产物统一为单一 AGENTS.md。
const SCHEMA_VERSION = "2.0";

// 稳定退出码：调用方（含自动化 Agent）依赖这些数值判断结果。
const EXIT_CODES = {
  ok: 0, // 成功，包含“已执行变更”和“无需变更”
  error: 1, // 未预期错误，例如缺少 .agents 工作区
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

module.exports = {
  AGENTS_ENTRY_FILE,
  COMMANDS,
  DEFAULT_LANGUAGE,
  DEFAULT_ROLE,
  EXIT_CODES,
  LOCAL_NOTICE,
  RESULT_STATUS,
  SCHEMA_VERSION,
};
