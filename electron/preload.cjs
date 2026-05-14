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
  importMapFile: () => ipcRenderer.invoke("map-files:import"),
  exportMapFile: (suggestedFileName, text) =>
    ipcRenderer.invoke("map-files:export", suggestedFileName, text),
  quit: () => ipcRenderer.invoke("app:quit")
});
