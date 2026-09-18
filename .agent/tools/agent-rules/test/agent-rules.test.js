const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const { runCli } = require("../src/cli");
const { runDoctor, runEnsure, runStatus, runSync } = require("../src/commands");
const { runInit } = require("../src/init");
const { CliError, setJsonMode } = require("../src/output");
const { createRepo } = require("../src/repo");
const { parseVendorList, resolveTargets } = require("../src/targets");

const toolRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(toolRoot, "..", "..", "..");

const MEMBER = {
  githubUser: "yz-yang04",
  githubEmail: "yz-yang04@users.noreply.github.com",
};

let cleanup = [];
let originalCwd;
let globalConfig;

before(() => {
  originalCwd = process.cwd();
  // 隔离全局 Git 身份，保证缺失字段等用例可确定复现。
  globalConfig = path.join(os.tmpdir(), `agent-rules-empty-${process.pid}.gitconfig`);
  fs.writeFileSync(globalConfig, "");
  process.env.GIT_CONFIG_GLOBAL = globalConfig;
  process.env.GIT_CONFIG_SYSTEM = globalConfig;
  // 禁用 gh 身份探测，避免测试依赖网络与本机登录状态。
  process.env.AGENT_RULES_NO_GH = "1";
});

after(() => {
  process.chdir(originalCwd);
  for (const dir of cleanup) fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(globalConfig, { force: true });
});

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-rules-"));
  cleanup.push(dir);
  fs.cpSync(path.join(repoRoot, ".agent"), path.join(dir, ".agent"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return createRepo(dir);
}

// 屏蔽人类可读日志，保持测试输出整洁。
async function silence(fn) {
  const ow = process.stdout.write;
  const oe = process.stderr.write;
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    return await fn();
  } finally {
    process.stdout.write = ow;
    process.stderr.write = oe;
  }
}

test("parseVendorList 展开 all 并校验非法目标", () => {
  assert.deepEqual([...parseVendorList("all")].sort(), ["claude", "codex", "cursor", "qoder"]);
  assert.deepEqual([...parseVendorList("codex,qoder")], ["codex", "qoder"]);
  assert.throws(() => parseVendorList("vscode"), (err) => err instanceof CliError && err.code === "config_incomplete");
});

test("resolveTargets 推断既有目标并支持 --agents/--target 等价", () => {
  const repo = makeFixture();
  fs.mkdirSync(repo.path(".qoder"), { recursive: true });
  const inferred = resolveTargets(repo, {});
  assert.ok(inferred.has("qoder"));
  const viaAgents = resolveTargets(repo, { agents: "codex,qoder" });
  const viaTarget = resolveTargets(repo, { target: "codex,qoder" });
  assert.deepEqual([...viaAgents].sort(), [...viaTarget].sort());
});

test("非交互 init 用团队映射补全真实姓名与角色", async () => {
  const repo = makeFixture();
  const result = await silence(() => runInit(repo, { nonInteractive: true, agents: "codex", ...MEMBER }));
  assert.equal(result.exitCode, 0);
  assert.ok(result.changedFiles.includes("AGENTS.md"));
  const content = repo.readText("AGENTS.md");
  assert.match(content, /杨明锋/);
  assert.match(content, /PM项目经理/);
});

test("非交互 init 身份不足时返回结构化 config_incomplete", async () => {
  const repo = makeFixture();
  await assert.rejects(
    () => silence(() => runInit(repo, { nonInteractive: true, agents: "codex" })),
    (err) => {
      assert.ok(err instanceof CliError);
      assert.equal(err.code, "config_incomplete");
      assert.equal(err.exitCode, 2);
      assert.ok(err.details.missingFields.length > 0);
      return true;
    },
  );
});

test("ensure 幂等：首次初始化，重复运行无变更", async () => {
  const repo = makeFixture();
  const targets = new Set(["codex", "qoder"]);
  const options = { nonInteractive: true, ...MEMBER };

  const first = await silence(() => runEnsure(repo, targets, options, runInit));
  assert.deepEqual(first.actions, ["init"]);
  assert.ok(first.changedFiles.length > 0);
  assert.equal(first.check.passed, true);
  assert.equal(first.status, "changed");

  const second = await silence(() => runEnsure(repo, targets, options, runInit));
  assert.deepEqual(second.actions, []);
  assert.deepEqual(second.changedFiles, []);
  assert.equal(second.status, "current");
  assert.equal(second.check.passed, true);
  assert.equal(second.nextAction, "none");
});

test("doctor 检测过期生成物并以退出码 3 报告", async () => {
  const repo = makeFixture();
  const targets = new Set(["codex", "qoder"]);
  await silence(() => runEnsure(repo, targets, { nonInteractive: true, ...MEMBER }, runInit));

  const clean = await silence(() => runDoctor(repo, targets));
  assert.equal(clean.check.passed, true);
  assert.equal(clean.exitCode, 0);

  repo.writeFile(".qoder/rules/main.md", "被手动篡改的内容\n");
  const dirty = await silence(() => runDoctor(repo, targets));
  assert.equal(dirty.check.passed, false);
  assert.equal(dirty.exitCode, 3);
  assert.ok(dirty.check.stale.some((item) => item.path === ".qoder/rules/main.md"));
});

test("sync 仅写入发生变化的生成物", async () => {
  const repo = makeFixture();
  await silence(() => runInit(repo, { nonInteractive: true, agents: "codex,qoder", ...MEMBER }));
  const again = await silence(() => runSync(repo, new Set(["codex", "qoder"]), {}));
  assert.deepEqual(again.changedFiles, []);
});

test("status 汇总操作者、目标状态与推荐动作", async () => {
  const repo = makeFixture();
  const before = await silence(() => runStatus(repo, new Set(["codex"]), { ...MEMBER }));
  assert.equal(before.operator.matchedMember, true);
  assert.equal(before.operator.resolved, true);
  assert.equal(before.nextAction, "init");

  await silence(() => runEnsure(repo, new Set(["codex"]), { nonInteractive: true, ...MEMBER }, runInit));
  const after = await silence(() => runStatus(repo, new Set(["codex"]), { ...MEMBER }));
  assert.equal(after.nextAction, "none");
  assert.equal(after.targetStatus[0].state, "current");
});

test("runCli --json 时 stdout 为纯 JSON 且带 schema/版本", async () => {
  const repo = makeFixture();
  process.chdir(repo.root);
  const chunks = [];
  const ow = process.stdout.write;
  const oe = process.stderr.write;
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  process.stderr.write = () => true;
  let code;
  try {
    code = await runCli([
      "node",
      "cli.js",
      "status",
      "--agents=codex",
      `--github-user=${MEMBER.githubUser}`,
      `--github-email=${MEMBER.githubEmail}`,
      "--json",
    ]);
  } finally {
    process.stdout.write = ow;
    process.stderr.write = oe;
  }
  assert.equal(code, 0);
  const payload = JSON.parse(chunks.join(""));
  assert.equal(payload.schemaVersion, "1.0");
  assert.equal(payload.command, "status");
  assert.equal(payload.cliVersion, require("../package.json").version);
  assert.equal(payload.operator.matchedMember, true);
  setJsonMode(false);
});

test("runCli doctor 校验失败返回退出码 3", async () => {
  const repo = makeFixture();
  await silence(() => runEnsure(repo, new Set(["qoder"]), { nonInteractive: true, ...MEMBER }, runInit));
  repo.writeFile(".qoder/rules/main.md", "篡改\n");
  process.chdir(repo.root);
  const code = await silence(() => runCli(["node", "cli.js", "doctor", "--target=qoder"]));
  assert.equal(code, 3);
});
