#!/usr/bin/env node

// 跨平台语法检查：对 cli.js 与 src/ 下所有 .js 逐个执行 node --check。
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = ["cli.js"];
for (const entry of fs.readdirSync(path.join(root, "src"))) {
  if (entry.endsWith(".js")) files.push(path.join("src", entry));
}

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "ignore" });
    process.stdout.write(`ok  ${file}\n`);
  } catch (error) {
    failed += 1;
    process.stderr.write(`FAIL ${file}\n`);
    execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "inherit" });
  }
}

if (failed) {
  process.stderr.write(`\n${failed} 个文件语法检查未通过。\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`\n全部 ${files.length} 个文件语法检查通过。\n`);
}
