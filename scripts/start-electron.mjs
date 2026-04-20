import { spawn } from "node:child_process";
import electronPath from "electron";

/**
 * Spawning Electron through Node avoids the shell wrapper issues
 * that happen on Windows UNC paths.
 */
const child = spawn(electronPath, ["."], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
