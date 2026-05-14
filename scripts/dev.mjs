import { watch } from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const requestedDevPort = parseDevPort(process.env.ASH_RUN_84_DEV_PORT);
const devPort = await resolveDevPort(requestedDevPort);
const sharedEnv = {
  ...process.env,
  ASH_RUN_84_DEV_PORT: String(devPort)
};
const devServerScript = path.resolve(root, "scripts/dev-server.mjs");
const electronScript = path.resolve(root, "scripts/start-electron.mjs");
const electronSourceDirectory = path.resolve(root, "electron");

let shuttingDown = false;
let electronProcess = null;
let restartingElectron = false;
let electronRestartTimer = null;
let electronWatcher = null;

const devServerProcess = spawn(process.execPath, [devServerScript], {
  cwd: root,
  stdio: "inherit",
  env: sharedEnv
});

devServerProcess.on("exit", (code) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (electronProcess && electronProcess.exitCode === null) {
    electronProcess.kill();
  }

  process.exit(code ?? 1);
});

try {
  await waitForPort(devPort, devServerProcess);
  watchElectronSources();
  launchElectron();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await shutdown(1);
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

async function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  clearTimeout(electronRestartTimer);
  electronWatcher?.close();

  if (electronProcess && electronProcess.exitCode === null) {
    electronProcess.kill();
    await onceChildExits(electronProcess);
  }

  if (devServerProcess.exitCode === null) {
    devServerProcess.kill();
    await onceChildExits(devServerProcess);
  }

  process.exit(exitCode);
}

function watchElectronSources() {
  electronWatcher = watch(electronSourceDirectory, (_eventType, fileName) => {
    if (!fileName || shuttingDown) {
      return;
    }

    clearTimeout(electronRestartTimer);
    electronRestartTimer = setTimeout(() => {
      restartElectron(`electron/${fileName}`);
    }, 120);
  });
}

function launchElectron() {
  const child = spawn(
    process.execPath,
    [electronScript, "--dev-server"],
    {
      cwd: root,
      stdio: "inherit",
      env: sharedEnv
    }
  );

  electronProcess = child;

  child.on("exit", (code) => {
    if (electronProcess !== child) {
      return;
    }

    electronProcess = null;

    if (shuttingDown) {
      return;
    }

    if (restartingElectron) {
      restartingElectron = false;
      launchElectron();
      return;
    }

    void shutdown(code ?? 0);
  });
}

function restartElectron(reason) {
  if (shuttingDown) {
    return;
  }

  if (!electronProcess || electronProcess.exitCode !== null) {
    launchElectron();
    return;
  }

  if (restartingElectron) {
    return;
  }

  restartingElectron = true;
  console.log(`Detected ${reason}. Restarting Electron so main/preload changes take effect.`);
  electronProcess.kill();
}

function parseDevPort(rawPort) {
  const fallbackPort = 5173;
  const parsedPort = Number(rawPort ?? fallbackPort);

  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(`ASH_RUN_84_DEV_PORT must be an integer between 1 and 65535. Received: ${rawPort}`);
  }

  return parsedPort;
}

async function resolveDevPort(preferredPort) {
  const maxPortChecks = 20;

  for (let offset = 0; offset < maxPortChecks; offset += 1) {
    const candidatePort = preferredPort + offset;

    if (candidatePort > 65535) {
      break;
    }

    if (await canListen(candidatePort)) {
      if (candidatePort !== preferredPort) {
        console.log(`Port ${preferredPort} is busy. Using port ${candidatePort} for the dev server instead.`);
      }

      return candidatePort;
    }
  }

  throw new Error(
    `Unable to find an open dev port starting at ${preferredPort}. ` +
      `Set ASH_RUN_84_DEV_PORT to an available port and try again.`
  );
}

async function waitForPort(port, childProcess, timeoutMs = 15000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (childProcess.exitCode !== null) {
      throw new Error(`The Vite dev server exited before port ${port} became available.`);
    }

    if (await canConnect(port)) {
      return;
    }

    await delay(150);
  }

  throw new Error(`Timed out waiting for the Vite dev server on port ${port}.`);
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      server.close(() => {
        resolve(false);
      });
    });

    server.listen(port, "127.0.0.1", () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect({
      host: "127.0.0.1",
      port
    });

    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function delay(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function onceChildExits(childProcess) {
  return new Promise((resolve) => {
    childProcess.once("exit", () => {
      resolve();
    });
  });
}
