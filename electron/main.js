import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_PATH = path.resolve(__dirname, "../dist/index.html");
const DEV_SERVER_URL = "http://127.0.0.1:5173";
const SLOT_IDS = ["slot-1", "slot-2", "slot-3"];
const META_FILE_NAME = "meta.json";

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
    title: "Ash Run",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (app.isPackaged) {
    await window.loadFile(DIST_PATH);
  } else {
    await window.loadURL(DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: "detach" });
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
