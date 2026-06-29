const GENERATED_NOTICE = "<!-- 由 .agent/tools/agent-rules 生成。请修改 .agent/rules/、.agent/skills/、.agent/team/、.agent/adapters/、.agent/templates/ 下的源文件。 -->\n\n";
const LOCAL_NOTICE = "<!-- 由 agent-rules 生成。本地文件已被 Git 忽略；如需更换身份信息，请重新运行 init。 -->\n\n";
const COMMANDS = new Set(["init", "sync", "doctor"]);
const DEFAULT_LANGUAGE = "简体中文";
const DEFAULT_ROLE = "全栈开发";

module.exports = {
  COMMANDS,
  DEFAULT_LANGUAGE,
  DEFAULT_ROLE,
  GENERATED_NOTICE,
  LOCAL_NOTICE,
};
