const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const DIST_PATH = path.resolve(__dirname, "../dist/index.html");
const DEV_SERVER_PORT = Number(process.env.ASH_RUN_84_DEV_PORT ?? 5173);
const DEV_SERVER_URL = `http://127.0.0.1:${DEV_SERVER_PORT}`;
const DEV_WINDOW_ICON_PATH = path.resolve(__dirname, "../assets/img/logos/logo.png");
const PACKAGED_WINDOW_ICON_PATH = path.resolve(__dirname, "../dist/assets/img/logos/logo.png");
const SLOT_IDS = ["slot-1", "slot-2", "slot-3"];
const META_FILE_NAME = "meta.json";
const USE_DEV_SERVER = !app.isPackaged && process.env.ASH_RUN_84_DEV_SERVER === "1";

/**
 * The main process owns desktop integration and save storage.
 * Renderer code only receives the narrow IPC methods it needs.
 */
function getStoragePaths() {
  const dataRoot = path.join(app.getPath("userData"), "storage");

  return {
    dataRoot,
    metaFile: path.join(dataRoot, META_FILE_NAME),
    slotFile: (slotId) => path.join(dataRoot, `${slotId}.json`)
  };
}

async function ensureStorageRoot() {
  const { dataRoot } = getStoragePaths();
  await fs.mkdir(dataRoot, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath, value) {
  await ensureStorageRoot();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function pathExists(targetPath) {
  try {
    const stats = await fs.stat(targetPath);
    return stats.isDirectory();
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function resolvePreferredMapDirectory() {
  const projectMapDirectory = path.resolve(app.getAppPath(), "src/game/content/maps");

  if (await pathExists(projectMapDirectory)) {
    return projectMapDirectory;
  }

  const cwdMapDirectory = path.resolve(process.cwd(), "src/game/content/maps");

  if (await pathExists(cwdMapDirectory)) {
    return cwdMapDirectory;
  }

  const fallbackDirectory = path.join(app.getPath("documents"), "Ash Run '84", "maps");
  await fs.mkdir(fallbackDirectory, { recursive: true });
  return fallbackDirectory;
}

function normalizeMapFileName(fileName) {
  const baseName = path.basename(String(fileName ?? "").trim() || "custom-map.json");

  return baseName.toLowerCase().endsWith(".json") ? baseName : `${baseName}.json`;
}

async function listSlotSummaries() {
  const { slotFile } = getStoragePaths();
  const slotRecords = await Promise.all(
    SLOT_IDS.map(async (slotId) => {
      const record = await readJson(slotFile(slotId), null);

      return {
        slotId,
        exists: Boolean(record),
        updatedAt: record?.updatedAt ?? null,
        summary: record?.summary ?? null
      };
    })
  );

  return slotRecords;
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1600,
    height: 920,
    minWidth: 1200,
    minHeight: 720,
    backgroundColor: "#09110f",
    title: "Ash Run '84",
    autoHideMenuBar: true,
    icon: app.isPackaged ? PACKAGED_WINDOW_ICON_PATH : DEV_WINDOW_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (USE_DEV_SERVER) {
    await window.loadURL(DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    await window.loadFile(DIST_PATH);
  }
}

ipcMain.handle("storage:load-meta", async () => {
  const { metaFile } = getStoragePaths();
  return readJson(metaFile, null);
});

ipcMain.handle("storage:save-meta", async (_event, metaState) => {
  const { metaFile } = getStoragePaths();
  await writeJson(metaFile, metaState);
  return metaState;
});

ipcMain.handle("storage:list-slots", async () => listSlotSummaries());

ipcMain.handle("storage:load-slot", async (_event, slotId) => {
  const { slotFile } = getStoragePaths();

  if (!SLOT_IDS.includes(slotId)) {
    throw new Error(`Unsupported slot id: ${slotId}`);
  }

  return readJson(slotFile(slotId), null);
});

ipcMain.handle("storage:save-slot", async (_event, slotId, slotRecord) => {
  const { slotFile } = getStoragePaths();

  if (!SLOT_IDS.includes(slotId)) {
    throw new Error(`Unsupported slot id: ${slotId}`);
  }

  await writeJson(slotFile(slotId), slotRecord);
  return {
    slotId,
    exists: true,
    updatedAt: slotRecord.updatedAt,
    summary: slotRecord.summary
  };
});

ipcMain.handle("storage:delete-slot", async (_event, slotId) => {
  const { slotFile } = getStoragePaths();

  if (!SLOT_IDS.includes(slotId)) {
    throw new Error(`Unsupported slot id: ${slotId}`);
  }

  try {
    await fs.unlink(slotFile(slotId));
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }

  return true;
});

ipcMain.handle("map-files:import", async (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const defaultDirectory = await resolvePreferredMapDirectory();
  const result = await dialog.showOpenDialog(browserWindow, {
    title: "Import Map JSON",
    defaultPath: defaultDirectory,
    filters: [
      {
        name: "JSON Maps",
        extensions: ["json"]
      }
    ],
    properties: ["openFile"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  return {
    filePath: result.filePaths[0],
    text: await fs.readFile(result.filePaths[0], "utf8")
  };
});

ipcMain.handle("map-files:export", async (event, suggestedFileName, text) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const defaultDirectory = await resolvePreferredMapDirectory();
  const result = await dialog.showSaveDialog(browserWindow, {
    title: "Save Map JSON",
    defaultPath: path.join(defaultDirectory, normalizeMapFileName(suggestedFileName)),
    filters: [
      {
        name: "JSON Maps",
        extensions: ["json"]
      }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await fs.mkdir(path.dirname(result.filePath), { recursive: true });
  await fs.writeFile(result.filePath, text, "utf8");

  return {
    filePath: result.filePath
  };
});

ipcMain.handle("app:quit", () => {
  app.quit();
  return true;
});

app.whenReady().then(async () => {
  await ensureStorageRoot();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
