const { normalizeNewlines } = require("./repo");
const { renderAll } = require("./render");

function runSync(repo, targets) {
  for (const output of renderAll(repo, targets)) {
    repo.writeFile(output.path, output.content);
    console.log(`synced ${output.path}`);
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
    console.error("agent-rules doctor found stale generated files:");
    for (const item of stale) console.error(`- ${item.path}: ${item.reason}`);
    console.error("Run: node .agent/tools/agent-rules/cli.js sync");
    process.exit(1);
  }
  console.log("agent-rules doctor passed");
}

module.exports = {
  runDoctor,
  runSync,
};
