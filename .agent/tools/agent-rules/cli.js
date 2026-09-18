#!/usr/bin/env node

const { runCli } = require("./src/cli");

runCli(process.argv)
  .then((exitCode) => {
    process.exitCode = exitCode || 0;
  })
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
