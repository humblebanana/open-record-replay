#!/usr/bin/env node
import { main } from "../packages/cli/src/index.mjs";

main(process.argv.slice(2)).catch((error) => {
  if (error?.name === "RecorderPermissionError") {
    console.error(JSON.stringify({
      error: error.name,
      message: error.message,
      permissions: error.permissions
    }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
