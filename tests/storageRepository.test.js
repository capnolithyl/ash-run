import test from "node:test";
import assert from "node:assert/strict";
import { StorageRepository } from "../src/game/services/StorageRepository.js";

function createLocalStorageMock() {
  const store = new Map();

  return {
    get length() {
      return store.size;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

test("storage repository saves and lists custom maps through localStorage fallback", async () => {
  const originalApi = globalThis.ashRun84Api;
  const originalStorage = globalThis.localStorage;

  globalThis.ashRun84Api = null;
  globalThis.localStorage = createLocalStorageMock();

  try {
    const repository = new StorageRepository();
    const savedMap = await repository.saveCustomMap(
      "runtime-save.json",
      JSON.stringify({
        id: "runtime-save",
        name: "Runtime Save",
        theme: "ash",
        width: 8,
        height: 8
      })
    );
    const customMaps = await repository.listCustomMaps();

    assert.equal(savedMap.id, "runtime-save");
    assert.equal(customMaps.length, 1);
    assert.equal(customMaps[0].name, "Runtime Save");
  } finally {
    globalThis.ashRun84Api = originalApi;
    globalThis.localStorage = originalStorage;
  }
});
