const fs = require("fs");
const path = require("path");

function createRepo(root) {
  return {
    root,
    path(relativePath) {
      return path.join(root, relativePath);
    },
    exists(relativePath) {
      return fs.existsSync(path.join(root, relativePath));
    },
    readText(relativePath) {
      return fs.readFileSync(path.join(root, relativePath), "utf8");
    },
    readJson(relativePath) {
      return JSON.parse(this.readText(relativePath));
    },
    writeFile(relativePath, content) {
      const absolute = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content);
    },
    writeFileGuarded(relativePath, content, force) {
      if (this.exists(relativePath) && !force) {
        throw new Error(`${relativePath} 已存在。如需覆盖，请重新运行 init 并加上 --force。`);
      }
      this.writeFile(relativePath, content);
    },
  };
}

function ensureAgentWorkspace(repo) {
  if (repo.exists(".agent")) return;
  throw new Error(`当前仓库缺少 .agent 目录：${repo.path(".agent")}。请在使用本模板初始化后的仓库根目录运行 agent-rules。`);
}

function findRepoRoot(start) {
  let current = start;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    current = path.dirname(current);
  }
  return start;
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n");
}

module.exports = {
  createRepo,
  ensureAgentWorkspace,
  findRepoRoot,
  normalizeNewlines,
};
