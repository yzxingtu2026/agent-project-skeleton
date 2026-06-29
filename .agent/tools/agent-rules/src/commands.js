const { normalizeNewlines } = require("./repo");
const { refreshLocalEntries } = require("./local-entries");
const { renderAll } = require("./render");

function runSync(repo, targets) {
  refreshLocalEntries(repo);
  for (const output of renderAll(repo, targets)) {
    repo.writeFile(output.path, output.content);
    console.log(`已生成 ${output.path}`);
  }
}

function runDoctor(repo, targets) {
  const stale = [];
  for (const output of renderAll(repo, targets)) {
    if (!repo.exists(output.path)) {
      stale.push({ path: output.path, reason: "missing" });
      continue;
    }
    const current = repo.readText(output.path);
    if (normalizeNewlines(current) !== normalizeNewlines(output.content)) {
      stale.push({ path: output.path, reason: "outdated" });
    }
  }

  if (stale.length) {
    console.error("生成物检查发现不一致：");
    for (const item of stale) console.error(`- ${item.path}: ${formatStaleReason(item.reason)}`);
    console.error("请运行：agent-rules sync");
    process.exit(1);
  }
  console.log("生成物检查通过");
}

function formatStaleReason(reason) {
  if (reason === "missing") return "文件缺失";
  if (reason === "outdated") return "内容已过期";
  return reason;
}

module.exports = {
  runDoctor,
  runSync,
};
