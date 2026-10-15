const { EXIT_CODES } = require("./constants");

// JSON 模式下，stdout 只输出最终 JSON，人类可读日志改走 stderr。
let jsonMode = false;

function setJsonMode(enabled) {
  jsonMode = Boolean(enabled);
}

function isJsonMode() {
  return jsonMode;
}

// 人类可读进度：普通模式写 stdout，JSON 模式写 stderr，保证 stdout 纯净。
function logInfo(message) {
  const stream = jsonMode ? process.stderr : process.stdout;
  stream.write(`${message}\n`);
}

// 诊断/错误信息始终写 stderr。
function logError(message) {
  process.stderr.write(`${message}\n`);
}

// 输出最终 JSON 到 stdout。
function emitJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

// 结构化错误：带稳定 code 和可操作 fix，供 JSON 输出和退出码使用。
class CliError extends Error {
  constructor(message, { code = "error", exitCode = EXIT_CODES.error, fix = "", details = null } = {}) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.fix = fix;
    this.details = details;
  }

  toJSON() {
    const base = { code: this.code, message: this.message, fix: this.fix };
    if (this.details) base.details = this.details;
    return base;
  }
}

module.exports = {
  CliError,
  emitJson,
  isJsonMode,
  logError,
  logInfo,
  setJsonMode,
};
