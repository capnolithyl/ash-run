const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  DEFAULT_WINDOW_RESOLUTION,
  DISPLAY_MODES,
  DISPLAY_RESOLUTION_PRESETS,
  getClosestDisplayResolutionPreset,
  getDisplayResolutionPreset,
  normalizeDisplayOptions,
  resolveDisplayResolutionForBounds
} = require("./displayOptions.cjs");
const {
  listLoadableMapFiles,
  loadMapFileFromRoot,
  normalizeMapRelativePath: normalizeMapRelativeImportPath,
  resolvePreferredMapRoot
} = require("./mapFiles.cjs");

const DIST_PATH = path.resolve(__dirname, "../dist/index.html");
const DEV_SERVER_PORT = Number(process.env.ASH_RUN_84_DEV_PORT ?? 5173);
const DEV_SERVER_URL = `http://127.0.0.1:${DEV_SERVER_PORT}`;
const DEV_WINDOW_ICON_PATH = path.resolve(__dirname, "../assets/img/logos/logo.png");
const PACKAGED_WINDOW_ICON_PATH = path.resolve(__dirname, "../dist/assets/img/logos/logo.png");
const SLOT_IDS = ["slot-1", "slot-2", "slot-3"];
const META_FILE_NAME = "meta.json";
const USE_DEV_SERVER = !app.isPackaged && process.env.ASH_RUN_84_DEV_SERVER === "1";

let mainWindow = null;
let appliedDisplayOptions = normalizeDisplayOptions();
let displayPreviewState = null;
let displayNotifyTimer = null;

/**
 * The main process owns desktop integration and save storage.
 * Renderer code only receives the narrow IPC methods it needs.
 */
function getStoragePaths() {
  const dataRoot = path.join(app.getPath("userData"), "storage");
  const customMapsRoot = path.join(app.getPath("documents"), "Ash Run '84", "maps");

  return {
    dataRoot,
    customMapsRoot,
    metaFile: path.join(dataRoot, META_FILE_NAME),
    slotFile: (slotId) => path.join(dataRoot, `${slotId}.json`),
    customMapFile: (fileName) => path.join(customMapsRoot, normalizeMapFileName(fileName))
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
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function getDisplayForWindow(browserWindow = mainWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) {
    return screen.getPrimaryDisplay();
  }

  const bounds = browserWindow.getBounds();

  return screen.getDisplayNearestPoint({
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  });
}

function getWindowPresetAvailability(display = screen.getPrimaryDisplay()) {
  const workArea = display.workArea ?? display.bounds;
  const bounds = display.bounds ?? workArea;

  return DISPLAY_RESOLUTION_PRESETS.map((preset) => ({
    ...preset,
    available: preset.width <= workArea.width && preset.height <= workArea.height,
    windowedAvailable: preset.width <= workArea.width && preset.height <= workArea.height,
    nativeAvailable: preset.width <= bounds.width && preset.height <= bounds.height
  }));
}

function getLargestAvailablePreset(display = screen.getPrimaryDisplay()) {
  const availablePresets = getWindowPresetAvailability(display).filter((preset) => preset.available);

  return availablePresets.at(-1) ?? getDisplayResolutionPreset("1280x720");
}

function resolveWindowedPreset(resolutionId, display = screen.getPrimaryDisplay()) {
  const requestedPreset = getDisplayResolutionPreset(resolutionId);
  const availablePresetIds = new Set(
    getWindowPresetAvailability(display)
      .filter((preset) => preset.available)
      .map((preset) => preset.id)
  );

  if (requestedPreset && availablePresetIds.has(requestedPreset.id)) {
    return requestedPreset;
  }

  return getLargestAvailablePreset(display) ?? getDisplayResolutionPreset(DEFAULT_WINDOW_RESOLUTION);
}

function getWindowedBoundsForPreset(preset, display = screen.getPrimaryDisplay()) {
  const workArea = display.workArea ?? display.bounds;

  return {
    x: Math.round(workArea.x + Math.max(0, (workArea.width - preset.width) / 2)),
    y: Math.round(workArea.y + Math.max(0, (workArea.height - preset.height) / 2)),
    width: preset.width,
    height: preset.height
  };
}

function getDisplaySummary(display = screen.getPrimaryDisplay()) {
  return {
    id: display.id,
    scaleFactor: display.scaleFactor,
    bounds: display.bounds,
    workArea: display.workArea
  };
}

function getCurrentDisplayState(browserWindow = mainWindow) {
  const display = getDisplayForWindow(browserWindow);
  const bounds = browserWindow && !browserWindow.isDestroyed() ? browserWindow.getBounds() : null;
  const isFullScreen =
    browserWindow && !browserWindow.isDestroyed() ? browserWindow.isFullScreen() : false;
  const displayMode = isFullScreen ? DISPLAY_MODES.FULLSCREEN : appliedDisplayOptions.displayMode;

  return {
    current: {
      ...appliedDisplayOptions,
      displayMode
    },
    bounds,
    display: getDisplaySummary(display),
    presets: getWindowPresetAvailability(display),
    pending: Boolean(displayPreviewState)
  };
}

function notifyDisplayState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("display:changed", getCurrentDisplayState(mainWindow));
}

function notifyDisplayStateSoon() {
  if (displayNotifyTimer) {
    clearTimeout(displayNotifyTimer);
  }

  displayNotifyTimer = setTimeout(() => {
    displayNotifyTimer = null;
    notifyDisplayState();
  }, 80);
}

function applyDisplayOptionsToWindow(browserWindow, options) {
  const normalizedOptions = normalizeDisplayOptions(options);
  const display = getDisplayForWindow(browserWindow);

  if (normalizedOptions.displayMode === DISPLAY_MODES.FULLSCREEN) {
    const preset = resolveDisplayResolutionForBounds(normalizedOptions.windowResolution, display.bounds);
    appliedDisplayOptions = {
      displayMode: DISPLAY_MODES.FULLSCREEN,
      windowResolution: preset.id
    };
    browserWindow.setFullScreen(true);
    return appliedDisplayOptions;
  }

  if (browserWindow.isFullScreen()) {
    browserWindow.setFullScreen(false);
  }

  if (normalizedOptions.displayMode === DISPLAY_MODES.BORDERLESS) {
    const targetDisplay = getDisplayForWindow(browserWindow);
    const preset = resolveDisplayResolutionForBounds(
      normalizedOptions.windowResolution,
      targetDisplay.bounds
    );
    appliedDisplayOptions = {
      displayMode: DISPLAY_MODES.BORDERLESS,
      windowResolution: preset.id
    };
    browserWindow.setBounds(targetDisplay.bounds);
    return appliedDisplayOptions;
  }

  const preset = resolveWindowedPreset(normalizedOptions.windowResolution, display);
  appliedDisplayOptions = {
    displayMode: DISPLAY_MODES.WINDOWED,
    windowResolution: preset.id
  };
  browserWindow.setBounds(getWindowedBoundsForPreset(preset, display));
  return appliedDisplayOptions;
}

function captureDisplayPreviewState(browserWindow) {
  return {
    appliedDisplayOptions,
    bounds: browserWindow.getBounds(),
    fullScreen: browserWindow.isFullScreen()
  };
}

function restoreDisplayPreviewState(browserWindow, previewState) {
  appliedDisplayOptions = previewState.appliedDisplayOptions;

  if (previewState.fullScreen) {
    browserWindow.setFullScreen(true);
    return;
  }

  if (browserWindow.isFullScreen()) {
    browserWindow.setFullScreen(false);
  }

  browserWindow.setBounds(previewState.bounds);
}

async function loadSavedDisplayOptions(display = screen.getPrimaryDisplay()) {
  const { metaFile } = getStoragePaths();
  const metaState = await readJson(metaFile, null);
  const rawOptions = metaState?.options ?? {};
  const normalizedOptions = normalizeDisplayOptions(rawOptions);
  const hasSavedResolution = Boolean(getDisplayResolutionPreset(rawOptions.windowResolution));

  if (hasSavedResolution) {
    return normalizedOptions;
  }

  if (normalizedOptions.displayMode === DISPLAY_MODES.WINDOWED) {
    return {
      ...normalizedOptions,
      windowResolution: resolveWindowedPreset(DEFAULT_WINDOW_RESOLUTION, display).id
    };
  }

  return {
    ...normalizedOptions,
    windowResolution: getClosestDisplayResolutionPreset(display.bounds).id
  };
}

function bindDisplayStateEvents(browserWindow) {
  for (const eventName of ["resize", "resized", "move", "moved", "enter-full-screen", "leave-full-screen"]) {
    browserWindow.on(eventName, notifyDisplayStateSoon);
  }
}

async function resolvePreferredMapDirectory() {
  const { customMapsRoot } = getStoragePaths();
  const preferredRoot = resolvePreferredMapRoot({
    isPackaged: app.isPackaged,
    customMapsRoot,
    bundledMapsRoot: getBundledMapsRoot()
  });
  await fs.mkdir(preferredRoot, { recursive: true });
  return preferredRoot;
}

function normalizeMapFileName(fileName) {
  const baseName = path.basename(String(fileName ?? "").trim() || "custom-map.json");

  return baseName.toLowerCase().endsWith(".json") ? baseName : `${baseName}.json`;
}

function normalizeMapRelativePath(filePath) {
  return normalizeMapRelativeImportPath(filePath);
}

function getBundledMapsRoot() {
  return path.resolve(__dirname, "../src/game/content/maps");
}

async function resolvePreferredMapPath(filePath = "custom-map.json") {
  const normalizedRelativePath = normalizeMapRelativePath(filePath);
  const baseRoot = app.isPackaged
    ? getStoragePaths().customMapsRoot
    : getBundledMapsRoot();
  const targetPath = path.join(baseRoot, normalizedRelativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  return targetPath;
}

async function readCustomMapFile(filePath) {
  try {
    return await readJson(filePath, null);
  } catch (error) {
    console.warn(`Skipping invalid custom map file: ${filePath}`, error);
    return null;
  }
}

async function collectJsonFiles(rootDirectory) {
  const directoryEntries = await fs.readdir(rootDirectory, { withFileTypes: true });
  const filePaths = [];

  for (const entry of directoryEntries) {
    const entryPath = path.join(rootDirectory, entry.name);

    if (entry.isDirectory()) {
      filePaths.push(...(await collectJsonFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      filePaths.push(entryPath);
    }
  }

  return filePaths;
}

async function listCustomMaps() {
  const { customMapsRoot } = getStoragePaths();
  await fs.mkdir(customMapsRoot, { recursive: true });
  const customMaps = await Promise.all(
    (await collectJsonFiles(customMapsRoot))
      .map((filePath) => readCustomMapFile(filePath))
  );

  return customMaps
    .filter(Boolean)
    .sort((left, right) => String(left.id ?? "").localeCompare(String(right.id ?? "")));
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
  const initialDisplay = screen.getPrimaryDisplay();
  const savedDisplayOptions = await loadSavedDisplayOptions(initialDisplay);
  const initialPreset = resolveWindowedPreset(savedDisplayOptions.windowResolution, initialDisplay);
  const initialBounds = getWindowedBoundsForPreset(initialPreset, initialDisplay);

  const window = new BrowserWindow({
    ...initialBounds,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: "#09110f",
    title: "Ash Run '84",
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: true,
    autoHideMenuBar: true,
    icon: app.isPackaged ? PACKAGED_WINDOW_ICON_PATH : DEV_WINDOW_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow = window;
  appliedDisplayOptions = {
    ...savedDisplayOptions,
    windowResolution: initialPreset.id
  };
  bindDisplayStateEvents(window);
  applyDisplayOptionsToWindow(window, appliedDisplayOptions);

  if (USE_DEV_SERVER) {
    await window.loadURL(DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    await window.loadFile(DIST_PATH);
  }

  notifyDisplayState();
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

ipcMain.handle("custom-maps:list", async () => listCustomMaps());

ipcMain.handle("custom-maps:save", async (_event, suggestedFileName, text) => {
  const { customMapFile } = getStoragePaths();
  const mapData = JSON.parse(text);
  const targetPath = customMapFile(suggestedFileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(mapData, null, 2), "utf8");
  return mapData;
});

ipcMain.handle("map-files:list", async () => {
  const rootDirectory = await resolvePreferredMapDirectory();
  return listLoadableMapFiles(rootDirectory, fs, console);
});

ipcMain.handle("map-files:load", async (_event, relativePath) => {
  const rootDirectory = await resolvePreferredMapDirectory();
  return loadMapFileFromRoot(rootDirectory, relativePath, fs);
});

async function handleMapFileSave(event, suggestedFileName, text) {
  const browserWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const defaultPath = await resolvePreferredMapPath(suggestedFileName);
  const result = await dialog.showSaveDialog(browserWindow, {
    title: "Save Map JSON",
    defaultPath,
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
}

ipcMain.handle("map-files:save", handleMapFileSave);
ipcMain.handle("map-files:export", handleMapFileSave);

ipcMain.handle("display:get-state", () => getCurrentDisplayState());

ipcMain.handle("display:apply", (event, displayOptions) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);

  if (!browserWindow) {
    return getCurrentDisplayState();
  }

  if (!displayPreviewState) {
    displayPreviewState = captureDisplayPreviewState(browserWindow);
  }

  applyDisplayOptionsToWindow(browserWindow, displayOptions);
  notifyDisplayState();
  return getCurrentDisplayState(browserWindow);
});

ipcMain.handle("display:confirm", (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  displayPreviewState = null;
  return getCurrentDisplayState(browserWindow ?? mainWindow);
});

ipcMain.handle("display:revert", (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);

  if (browserWindow && displayPreviewState) {
    restoreDisplayPreviewState(browserWindow, displayPreviewState);
  }

  displayPreviewState = null;
  notifyDisplayState();
  return getCurrentDisplayState(browserWindow ?? mainWindow);
});

ipcMain.handle("display:return-windowed", (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);

  if (!browserWindow) {
    return getCurrentDisplayState();
  }

  displayPreviewState = null;
  applyDisplayOptionsToWindow(browserWindow, {
    ...appliedDisplayOptions,
    displayMode: DISPLAY_MODES.WINDOWED
  });
  notifyDisplayState();
  return getCurrentDisplayState(browserWindow);
});

ipcMain.handle("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
  return true;
});

ipcMain.handle("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
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
