import { spawn } from "node:child_process";
import electronPath from "electron";

/**
 * Spawning Electron through Node avoids the shell wrapper issues
 * that happen on Windows UNC paths.
 */
const useDevServer = process.argv.includes("--dev-server");
const childEnv = {
  ...process.env,
  ASH_RUN_DEV_SERVER: useDevServer ? "1" : "0"
};

delete childEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ["."], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: childEnv
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
