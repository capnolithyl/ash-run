import { createDefaultMetaState, createEmptySlotSummaries } from "../state/defaults.js";

const META_KEY = "ash-run-84:meta";
const SLOT_KEY_PREFIX = "ash-run-84:slot:";
const CUSTOM_MAP_KEY_PREFIX = "ash-run-84:custom-map:";

function normalizeCustomMapStorageKey(fileName, mapData = null) {
  const preferredId = String(mapData?.id ?? "").trim();
  const baseName = String(fileName ?? "")
    .trim()
    .replace(/\.json$/i, "");

  return preferredId || baseName || "custom-map";
}

/**
 * The repository hides whether we are running in Electron or in a browser.
 * That keeps the controller agnostic to the host environment.
 */
export class StorageRepository {
  constructor() {
    this.desktopApi = globalThis.ashRun84Api ?? null;
  }

  async loadMeta() {
    if (this.desktopApi) {
      return (await this.desktopApi.loadMeta()) ?? createDefaultMetaState();
    }

    const raw = globalThis.localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : createDefaultMetaState();
  }

  async saveMeta(metaState) {
    if (this.desktopApi) {
      return this.desktopApi.saveMeta(metaState);
    }

    globalThis.localStorage.setItem(META_KEY, JSON.stringify(metaState));
    return metaState;
  }

  async listSlots() {
    if (this.desktopApi) {
      return this.desktopApi.listSlots();
    }

    const slotSummaries = createEmptySlotSummaries();

    return slotSummaries.map((slot) => {
      const raw = globalThis.localStorage.getItem(`${SLOT_KEY_PREFIX}${slot.slotId}`);

      if (!raw) {
        return slot;
      }

      const record = JSON.parse(raw);

      return {
        slotId: slot.slotId,
        exists: true,
        updatedAt: record.updatedAt,
        summary: record.summary
      };
    });
  }

  async loadSlot(slotId) {
    if (this.desktopApi) {
      return this.desktopApi.loadSlot(slotId);
    }

    const raw = globalThis.localStorage.getItem(`${SLOT_KEY_PREFIX}${slotId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async saveSlot(slotId, slotRecord) {
    if (this.desktopApi) {
      return this.desktopApi.saveSlot(slotId, slotRecord);
    }

    globalThis.localStorage.setItem(
      `${SLOT_KEY_PREFIX}${slotId}`,
      JSON.stringify(slotRecord)
    );

    return {
      slotId,
      exists: true,
      updatedAt: slotRecord.updatedAt,
      summary: slotRecord.summary
    };
  }

  async deleteSlot(slotId) {
    if (this.desktopApi) {
      return this.desktopApi.deleteSlot(slotId);
    }

    globalThis.localStorage.removeItem(`${SLOT_KEY_PREFIX}${slotId}`);
    return true;
  }

  async listCustomMaps() {
    if (this.desktopApi?.listCustomMaps) {
      return (await this.desktopApi.listCustomMaps()) ?? [];
    }

    const storage = globalThis.localStorage;

    if (!storage) {
      return [];
    }

    const customMaps = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (!key?.startsWith(CUSTOM_MAP_KEY_PREFIX)) {
        continue;
      }

      const raw = storage.getItem(key);

      if (!raw) {
        continue;
      }

      customMaps.push(JSON.parse(raw));
    }

    return customMaps.sort((left, right) =>
      String(left?.id ?? "").localeCompare(String(right?.id ?? ""))
    );
  }

  async saveCustomMap(fileName, text) {
    if (this.desktopApi?.saveCustomMap) {
      return this.desktopApi.saveCustomMap(fileName, text);
    }

    const storage = globalThis.localStorage;

    if (!storage) {
      throw new Error("Custom map storage is unavailable in this environment.");
    }

    const mapData = JSON.parse(text);
    const storageKey = `${CUSTOM_MAP_KEY_PREFIX}${normalizeCustomMapStorageKey(
      fileName,
      mapData
    )}`;
    storage.setItem(storageKey, JSON.stringify(mapData));
    return mapData;
  }

  async saveMapFile(fileName, text) {
    if (this.desktopApi?.saveMapFile) {
      return this.desktopApi.saveMapFile(fileName, text);
    }

    if (this.desktopApi?.exportMapFile) {
      return this.desktopApi.exportMapFile(fileName, text);
    }

    return {
      unsupported: true
    };
  }

  async listMapFiles() {
    if (this.desktopApi?.listMapFiles) {
      return this.desktopApi.listMapFiles();
    }

    return {
      unsupported: true,
      rootPath: null,
      entries: []
    };
  }

  async loadMapFile(relativePath) {
    if (this.desktopApi?.loadMapFile) {
      return this.desktopApi.loadMapFile(relativePath);
    }

    return {
      unsupported: true
    };
  }

  async quit() {
    if (this.desktopApi) {
      return this.desktopApi.quit();
    }

    globalThis.close();
    return true;
  }
}
