const { contextBridge, ipcRenderer } = require("electron");

/**
 * Electron executes sandboxed preload scripts as CommonJS in this setup.
 * Keeping the bridge in `.cjs` avoids the module-loader mismatch shown in devtools.
 */
contextBridge.exposeInMainWorld("ashRun84Api", {
  loadMeta: () => ipcRenderer.invoke("storage:load-meta"),
  saveMeta: (metaState) => ipcRenderer.invoke("storage:save-meta", metaState),
  listSlots: () => ipcRenderer.invoke("storage:list-slots"),
  loadSlot: (slotId) => ipcRenderer.invoke("storage:load-slot", slotId),
  saveSlot: (slotId, slotRecord) =>
    ipcRenderer.invoke("storage:save-slot", slotId, slotRecord),
  deleteSlot: (slotId) => ipcRenderer.invoke("storage:delete-slot", slotId),
  listCustomMaps: () => ipcRenderer.invoke("custom-maps:list"),
  saveCustomMap: (suggestedFileName, text) =>
    ipcRenderer.invoke("custom-maps:save", suggestedFileName, text),
  listMapFiles: () => ipcRenderer.invoke("map-files:list"),
  loadMapFile: (relativePath) => ipcRenderer.invoke("map-files:load", relativePath),
  saveMapFile: (suggestedFileName, text) =>
    ipcRenderer.invoke("map-files:save", suggestedFileName, text),
  exportMapFile: (suggestedFileName, text) =>
    ipcRenderer.invoke("map-files:export", suggestedFileName, text),
  getDisplayState: () => ipcRenderer.invoke("display:get-state"),
  applyDisplaySettings: (displayOptions) =>
    ipcRenderer.invoke("display:apply", displayOptions),
  confirmDisplaySettings: () => ipcRenderer.invoke("display:confirm"),
  revertDisplaySettings: () => ipcRenderer.invoke("display:revert"),
  returnToWindowed: () => ipcRenderer.invoke("display:return-windowed"),
  onDisplayChanged: (callback) => {
    const listener = (_event, displayState) => callback(displayState);
    ipcRenderer.on("display:changed", listener);
    return () => ipcRenderer.removeListener("display:changed", listener);
  },
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  quit: () => ipcRenderer.invoke("app:quit")
});
