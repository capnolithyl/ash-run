const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  getDistDirectoryName,
  hasMapToolAccess,
  readBuildProfileMetadata
} = require("./buildProfile.cjs");
const {
  DEFAULT_WINDOW_RESOLUTION,
  DISPLAY_MODES,
  DISPLAY_RESOLUTION_PRESETS,
  getClampedWindowBoundsForWorkArea,
  getClosestDisplayResolutionPreset,
  getDisplayResolutionPreset,
  normalizeDisplayOptions,
  resolveDisplayResolutionForBounds,
  resolveWindowResolutionForWorkArea
} = require("./displayOptions.cjs");
const {
  listLoadableMapFiles,
  loadMapFileFromRoot,
  normalizeMapRelativePath: normalizeMapRelativeImportPath,
  resolvePreferredMapRoot
} = require("./mapFiles.cjs");

const DEV_SERVER_PORT = Number(process.env.ASH_RUN_84_DEV_PORT ?? 5173);
const DEV_SERVER_URL = `http://127.0.0.1:${DEV_SERVER_PORT}`;
const DEV_WINDOW_ICON_PATH = path.resolve(__dirname, "../assets/img/logos/logo.png");
const SLOT_IDS = ["slot-1", "slot-2", "slot-3"];
const META_FILE_NAME = "meta.json";
const USE_DEV_SERVER = !app.isPackaged && process.env.ASH_RUN_84_DEV_SERVER === "1";
const APP_ROOT = path.resolve(__dirname, "..");
const DIST_DIRECTORY_NAME = app.isPackaged ? "dist" : getDistDirectoryName(process.env);
const DIST_ROOT = path.resolve(APP_ROOT, DIST_DIRECTORY_NAME);
const DIST_PATH = path.join(DIST_ROOT, "index.html");
const PACKAGED_WINDOW_ICON_PATH = path.join(DIST_ROOT, "assets/img/logos/logo.png");
const BUILD_PROFILE_METADATA = readBuildProfileMetadata({
  appRoot: APP_ROOT,
  environment: app.isPackaged
    ? {
        ...process.env,
        ASH_RUN_84_BUILD_PROFILE: undefined,
        ASH_RUN_84_DIST_DIR: "dist"
      }
    : process.env,
  isDevServer: USE_DEV_SERVER
});
const MAP_TOOLS_ENABLED = hasMapToolAccess(BUILD_PROFILE_METADATA);
const DISPLAY_PREVIEW_TIMEOUT_MS = 12_000;
const DISPLAY_RENDERER_READY_TIMEOUT_MS = 5_000;
const DISPLAY_SETTLE_TIMEOUT_MS = 1_500;

app.setName(BUILD_PROFILE_METADATA.identity.productName);
app.setPath(
  "userData",
  process.env.ASH_RUN_84_USER_DATA_DIR
    ? path.resolve(process.env.ASH_RUN_84_USER_DATA_DIR)
    : path.join(app.getPath("appData"), BUILD_PROFILE_METADATA.identity.storageDirectoryName)
);

function isSafeGraphicsModeRequestedAtStartup() {
  if (process.argv.includes("--safe-graphics")) {
    return true;
  }

  try {
    const metaFile = path.join(app.getPath("userData"), "storage", META_FILE_NAME);
    return JSON.parse(fsSync.readFileSync(metaFile, "utf8"))?.options?.safeGraphicsMode === true;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("Unable to read Safe Graphics Mode preference during startup.", error);
    }

    return false;
  }
}

const safeGraphicsModeActive = isSafeGraphicsModeRequestedAtStartup();

if (safeGraphicsModeActive) {
  app.disableHardwareAcceleration();
}

let mainWindow = null;
let appliedDisplayOptions = normalizeDisplayOptions();
let displayPreviewState = null;
let displayNotifyTimer = null;
let displayPreviewTimer = null;
let displayRendererReadyTimer = null;
let displayTransitionSequence = 0;
let displayTransactionQueue = Promise.resolve();
let lastDisplayTransitionFailure = null;
let displayStateRevision = 0;

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

  return availablePresets.at(-1) ?? null;
}

function getWorkAreaFitPreset(display = screen.getPrimaryDisplay()) {
  const workArea = display.workArea ?? display.bounds;
  return resolveWindowResolutionForWorkArea("1280x720", workArea);
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

  return getLargestAvailablePreset(display) ?? getWorkAreaFitPreset(display);
}

function getWindowedBoundsForPreset(preset, display = screen.getPrimaryDisplay()) {
  const workArea = display.workArea ?? display.bounds;
  return getClampedWindowBoundsForWorkArea(preset, workArea);
}

function getDisplayById(displayId) {
  return screen.getAllDisplays().find((display) => display.id === displayId) ?? null;
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
    revision: displayStateRevision,
    current: {
      ...appliedDisplayOptions,
      displayMode
    },
    bounds,
    display: getDisplaySummary(display),
    presets: getWindowPresetAvailability(display),
    safeGraphicsModeActive,
    pending: Boolean(displayPreviewState),
    transitionId: displayPreviewState?.transitionId ?? null,
    transitionPhase: displayPreviewState?.phase ?? null,
    expiresAt: displayPreviewState?.expiresAt ?? null,
    originDisplayId: displayPreviewState?.originDisplayId ?? null,
    transitionFailure: lastDisplayTransitionFailure
  };
}

function updateWindowMinimumSize(browserWindow, display = getDisplayForWindow(browserWindow)) {
  const workArea = display.workArea ?? display.bounds;
  browserWindow.setMinimumSize(
    Math.max(1, Math.min(1280, Math.round(workArea.width))),
    Math.max(1, Math.min(720, Math.round(workArea.height)))
  );
}

function notifyDisplayState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  displayStateRevision += 1;
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

function areWindowBoundsEqual(left, right) {
  return Boolean(left && right) &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height;
}

function waitForFullscreenState(browserWindow, fullScreen) {
  if (browserWindow.isFullScreen() === fullScreen) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const eventName = fullScreen ? "enter-full-screen" : "leave-full-screen";
    const timeout = setTimeout(finish, DISPLAY_SETTLE_TIMEOUT_MS);

    function finish() {
      clearTimeout(timeout);
      browserWindow.removeListener(eventName, finish);
      setImmediate(resolve);
    }

    browserWindow.once(eventName, finish);
    browserWindow.setFullScreen(fullScreen);
  });
}

function waitForSettledBounds(browserWindow, targetBounds) {
  return new Promise((resolve) => {
    let settleTimer = null;
    const timeout = setTimeout(() => finish(), DISPLAY_SETTLE_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      browserWindow.removeListener("resized", check);
      browserWindow.removeListener("moved", check);
    }

    function finish() {
      cleanup();
      resolve(browserWindow.getBounds());
    }

    function check() {
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      settleTimer = setTimeout(
        finish,
        areWindowBoundsEqual(browserWindow.getBounds(), targetBounds) ? 60 : 150
      );
    }

    browserWindow.on("resized", check);
    browserWindow.on("moved", check);
    check();
  });
}

function clampExistingBoundsToDisplay(bounds, display) {
  const workArea = display.workArea ?? display.bounds;
  const width = Math.min(Math.max(1, bounds.width), workArea.width);
  const height = Math.min(Math.max(1, bounds.height), workArea.height);

  return {
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height),
    width,
    height
  };
}

async function setSettledBounds(browserWindow, bounds) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    browserWindow.setBounds(bounds);
    const settledBounds = await waitForSettledBounds(browserWindow, bounds);
    if (areWindowBoundsEqual(settledBounds, bounds)) {
      return settledBounds;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }

  throw new Error(
    `Window bounds did not settle at ${bounds.width}x${bounds.height} (${bounds.x},${bounds.y}).`
  );
}

async function applyDisplayOptionsToWindow(browserWindow, options, targetDisplay = null) {
  const normalizedOptions = normalizeDisplayOptions(options);
  const display = targetDisplay ?? getDisplayForWindow(browserWindow);

  if (normalizedOptions.displayMode === DISPLAY_MODES.FULLSCREEN) {
    const preset = resolveDisplayResolutionForBounds(normalizedOptions.windowResolution, display.bounds);
    appliedDisplayOptions = {
      displayMode: DISPLAY_MODES.FULLSCREEN,
      windowResolution: preset.id
    };
    await waitForFullscreenState(browserWindow, true);
    return appliedDisplayOptions;
  }

  await waitForFullscreenState(browserWindow, false);

  if (normalizedOptions.displayMode === DISPLAY_MODES.BORDERLESS) {
    const preset = resolveDisplayResolutionForBounds(
      normalizedOptions.windowResolution,
      display.bounds
    );
    appliedDisplayOptions = {
      displayMode: DISPLAY_MODES.BORDERLESS,
      windowResolution: preset.id
    };
    await setSettledBounds(browserWindow, display.bounds);
    return appliedDisplayOptions;
  }

  const preset = resolveWindowedPreset(normalizedOptions.windowResolution, display);
  appliedDisplayOptions = {
    displayMode: DISPLAY_MODES.WINDOWED,
    windowResolution: preset.id,
    constrainedToWorkArea: preset.constrainedToWorkArea === true
  };
  updateWindowMinimumSize(browserWindow, display);
  await setSettledBounds(browserWindow, getWindowedBoundsForPreset(preset, display));
  return appliedDisplayOptions;
}

function captureDisplayPreviewState(browserWindow) {
  const display = getDisplayForWindow(browserWindow);
  return {
    transitionId: `display-${Date.now()}-${++displayTransitionSequence}`,
    phase: "applying",
    expiresAt: null,
    originDisplayId: display.id,
    appliedDisplayOptions: { ...appliedDisplayOptions },
    bounds: browserWindow.getBounds(),
    fullScreen: browserWindow.isFullScreen()
  };
}

async function restoreDisplayPreviewState(browserWindow, previewState) {
  appliedDisplayOptions = { ...previewState.appliedDisplayOptions };
  const originalDisplay = getDisplayById(previewState.originDisplayId) ?? getDisplayForWindow(browserWindow);

  if (previewState.fullScreen) {
    await waitForFullscreenState(browserWindow, true);
    return;
  }

  await waitForFullscreenState(browserWindow, false);
  updateWindowMinimumSize(browserWindow, originalDisplay);
  await setSettledBounds(
    browserWindow,
    clampExistingBoundsToDisplay(previewState.bounds, originalDisplay)
  );
}

function clearDisplayTransitionTimers() {
  if (displayPreviewTimer) {
    clearTimeout(displayPreviewTimer);
    displayPreviewTimer = null;
  }
  if (displayRendererReadyTimer) {
    clearTimeout(displayRendererReadyTimer);
    displayRendererReadyTimer = null;
  }
}

function enqueueDisplayTransaction(task) {
  const run = displayTransactionQueue.then(task, task);
  displayTransactionQueue = run.catch(() => {});
  return run;
}

async function revertActiveDisplayPreview(browserWindow, reason = "user") {
  const previewState = displayPreviewState;

  if (!previewState) {
    return getCurrentDisplayState(browserWindow);
  }

  clearDisplayTransitionTimers();
  previewState.phase = "reverting";
  previewState.expiresAt = null;
  notifyDisplayState();
  await restoreDisplayPreviewState(browserWindow, previewState);

  if (reason === "renderer-timeout" || reason === "apply-failed") {
    lastDisplayTransitionFailure = {
      id: previewState.transitionId,
      reason,
      message: reason === "renderer-timeout"
        ? "The new resolution did not repaint correctly, so the previous display settings were restored."
        : "The display change could not be completed, so the previous settings were restored."
    };
  }

  displayPreviewState = null;
  notifyDisplayState();
  return getCurrentDisplayState(browserWindow);
}

function startRendererReadyTimeout(browserWindow, transitionId) {
  if (displayRendererReadyTimer) {
    clearTimeout(displayRendererReadyTimer);
  }

  displayRendererReadyTimer = setTimeout(() => {
    displayRendererReadyTimer = null;
    void enqueueDisplayTransaction(async () => {
      if (displayPreviewState?.transitionId !== transitionId ||
          displayPreviewState.phase !== "awaiting-renderer") {
        return;
      }
      await revertActiveDisplayPreview(browserWindow, "renderer-timeout");
    });
  }, DISPLAY_RENDERER_READY_TIMEOUT_MS);
}

function startDisplayPreviewTimeout(browserWindow, transitionId) {
  if (displayPreviewTimer) {
    clearTimeout(displayPreviewTimer);
  }

  displayPreviewTimer = setTimeout(() => {
    displayPreviewTimer = null;
    void enqueueDisplayTransaction(async () => {
      if (displayPreviewState?.transitionId !== transitionId ||
          displayPreviewState.phase !== "previewing") {
        return;
      }
      await revertActiveDisplayPreview(browserWindow, "preview-timeout");
    });
  }, DISPLAY_PREVIEW_TIMEOUT_MS);
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
    browserWindow.on(eventName, () => {
      if (displayPreviewState?.phase === "applying" ||
          displayPreviewState?.phase === "reverting") {
        return;
      }
      notifyDisplayStateSoon();
    });
  }

  browserWindow.on("moved", () => updateWindowMinimumSize(browserWindow));
  for (const eventName of ["enter-full-screen", "leave-full-screen"]) {
    browserWindow.on(eventName, () => {
      browserWindow.focus();
      browserWindow.webContents.focus();
      notifyDisplayStateSoon();
    });
  }
}

async function persistDisplayOptionsPatch(patch) {
  const { metaFile } = getStoragePaths();
  const metaState = await readJson(metaFile, {});
  const nextMetaState = {
    ...metaState,
    options: {
      ...(metaState?.options ?? {}),
      ...patch
    }
  };

  await writeJson(metaFile, nextMetaState);
}

async function resolvePreferredMapDirectory() {
  const { customMapsRoot } = getStoragePaths();
  const preferredRoot = resolvePreferredMapRoot({
    isPackaged: app.isPackaged,
    customMapsRoot,
    bundledMapsRoot: getBundledMapsRoot(),
    packagedMapsRoot: getPackagedBundledMapsRoot()
  });

  if (!app.isPackaged) {
    await fs.mkdir(preferredRoot, { recursive: true });
  }

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

function getPackagedBundledMapsRoot() {
  return path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "dist",
    "map-resources"
  );
}

async function resolvePreferredMapPath(filePath = "custom-map.json") {
  const { customMapsRoot } = getStoragePaths();
  const normalizedRelativePath = normalizeMapRelativePath(filePath);
  const baseRoot = app.isPackaged
    ? customMapsRoot
    : getBundledMapsRoot();
  const targetPath = path.join(baseRoot, normalizedRelativePath);

  if (!app.isPackaged) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
  }

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
    minWidth: Math.max(1, Math.min(1280, initialDisplay.workArea.width)),
    minHeight: Math.max(1, Math.min(720, initialDisplay.workArea.height)),
    backgroundColor: "#09110f",
    title: BUILD_PROFILE_METADATA.identity.productName,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: true,
    autoHideMenuBar: true,
    icon: app.isPackaged ? PACKAGED_WINDOW_ICON_PATH : DEV_WINDOW_ICON_PATH,
    webPreferences: {
      autoplayPolicy: "no-user-gesture-required",
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
  await applyDisplayOptionsToWindow(window, appliedDisplayOptions);
  window.webContents.on("before-input-event", (event, input) => {
    if (
      window.isFullScreen() &&
      input.type === "keyDown" &&
      (input.key === "Escape" || input.key === "F11")
    ) {
      event.preventDefault();
      void enqueueDisplayTransaction(async () => {
        clearDisplayTransitionTimers();
        displayPreviewState = null;
        await applyDisplayOptionsToWindow(window, {
          ...appliedDisplayOptions,
          displayMode: DISPLAY_MODES.WINDOWED
        });
        notifyDisplayState();
        await persistDisplayOptionsPatch({ displayMode: DISPLAY_MODES.WINDOWED });
      });
    }
  });

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

if (MAP_TOOLS_ENABLED) {
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

  ipcMain.handle("map-files:save", handleMapFileSave);
  ipcMain.handle("map-files:export", handleMapFileSave);
}

ipcMain.handle("display:get-state", () => getCurrentDisplayState());

ipcMain.handle("display:apply", (event, displayOptions) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);

  if (!browserWindow) {
    return getCurrentDisplayState();
  }

  return enqueueDisplayTransaction(async () => {
    if (displayPreviewState) {
      await revertActiveDisplayPreview(browserWindow, "superseded");
    }

    lastDisplayTransitionFailure = null;
    displayPreviewState = captureDisplayPreviewState(browserWindow);
    const transitionId = displayPreviewState.transitionId;
    const originDisplay = getDisplayById(displayPreviewState.originDisplayId) ??
      getDisplayForWindow(browserWindow);
    notifyDisplayState();

    try {
      await applyDisplayOptionsToWindow(browserWindow, displayOptions, originDisplay);
      displayPreviewState.phase = "awaiting-renderer";
      notifyDisplayState();
      startRendererReadyTimeout(browserWindow, transitionId);
      return getCurrentDisplayState(browserWindow);
    } catch (error) {
      console.error("Unable to apply display settings.", error);
      return revertActiveDisplayPreview(browserWindow, "apply-failed");
    }
  });
});

ipcMain.handle("display:renderer-ready", (event, rendererState = {}) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);

  return enqueueDisplayTransaction(async () => {
    if (!browserWindow ||
        !displayPreviewState ||
        displayPreviewState.phase !== "awaiting-renderer" ||
        rendererState.transitionId !== displayPreviewState.transitionId) {
      return getCurrentDisplayState(browserWindow ?? mainWindow);
    }

    const dimensionsMatch =
      Number(rendererState.canvasWidth) === Number(rendererState.parentWidth) &&
      Number(rendererState.canvasHeight) === Number(rendererState.parentHeight) &&
      Number(rendererState.canvasWidth) > 0 &&
      Number(rendererState.canvasHeight) > 0;

    if (!dimensionsMatch || rendererState.painted !== true) {
      return getCurrentDisplayState(browserWindow);
    }

    if (displayRendererReadyTimer) {
      clearTimeout(displayRendererReadyTimer);
      displayRendererReadyTimer = null;
    }

    displayPreviewState.phase = "previewing";
    displayPreviewState.expiresAt = Date.now() + DISPLAY_PREVIEW_TIMEOUT_MS;
    startDisplayPreviewTimeout(browserWindow, displayPreviewState.transitionId);
    notifyDisplayState();
    return getCurrentDisplayState(browserWindow);
  });
});

ipcMain.handle("display:confirm", (event, transitionId = null) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);

  return enqueueDisplayTransaction(async () => {
    if (!browserWindow ||
        !displayPreviewState ||
        displayPreviewState.phase !== "previewing" ||
        (transitionId && transitionId !== displayPreviewState.transitionId)) {
      return getCurrentDisplayState(browserWindow ?? mainWindow);
    }

    clearDisplayTransitionTimers();
    displayPreviewState = null;
    notifyDisplayState();
    return getCurrentDisplayState(browserWindow);
  });
});

ipcMain.handle("display:revert", (event, transitionId = null) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);

  return enqueueDisplayTransaction(async () => {
    if (!browserWindow ||
        (transitionId && transitionId !== displayPreviewState?.transitionId)) {
      return getCurrentDisplayState(browserWindow ?? mainWindow);
    }
    return revertActiveDisplayPreview(browserWindow, "user");
  });
});

ipcMain.handle("display:return-windowed", (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);

  if (!browserWindow) {
    return getCurrentDisplayState();
  }

  return enqueueDisplayTransaction(async () => {
    if (displayPreviewState) {
      await revertActiveDisplayPreview(browserWindow, "recovery");
    }
    clearDisplayTransitionTimers();
    displayPreviewState = null;
    await applyDisplayOptionsToWindow(browserWindow, {
      ...appliedDisplayOptions,
      displayMode: DISPLAY_MODES.WINDOWED
    });
    notifyDisplayState();
    return getCurrentDisplayState(browserWindow);
  });
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
