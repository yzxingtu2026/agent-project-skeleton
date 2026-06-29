#!/usr/bin/env node

const { runCli } = require("./src/cli");

runCli(process.argv).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
