import { createDefaultMetaState, createEmptySlotSummaries } from "../state/defaults.js";

const META_KEY = "ash-run:meta";
const SLOT_KEY_PREFIX = "ash-run:slot:";

/**
 * The repository hides whether we are running in Electron or in a browser.
 * That keeps the controller agnostic to the host environment.
 */
export class StorageRepository {
  constructor() {
    this.desktopApi = globalThis.ashApi ?? null;
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

  async quit() {
    if (this.desktopApi) {
      return this.desktopApi.quit();
    }

    globalThis.close();
    return true;
  }
}

