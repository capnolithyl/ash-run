import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILD_FEATURES,
  BUILD_PROFILES,
  getBuildProfileConfig
} from "../src/game/core/buildProfiles.js";
import { SCREEN_IDS } from "../src/game/core/constants.js";
import { GameController } from "../src/game/app/GameController.js";
import { replaceCustomMaps } from "../src/game/content/maps.js";
import { renderTitleView } from "../src/ui/views/titleView.js";
import { StorageRepository } from "../src/game/services/StorageRepository.js";

function createTitleState() {
  return {
    slots: [
      { slotId: "slot-1", exists: false },
      { slotId: "slot-2", exists: false },
      { slotId: "slot-3", exists: false }
    ],
    metaState: {
      latestClearTurnCount: null,
      bestClearTurnCount: null
    }
  };
}

test.afterEach(() => {
  replaceCustomMaps([]);
});

test("build profiles expose the exact alpha capability matrix", () => {
  const development = getBuildProfileConfig(BUILD_PROFILES.DEVELOPMENT);
  const production = getBuildProfileConfig(BUILD_PROFILES.PRODUCTION);

  assert.deepEqual(development.capabilities, {
    run: true,
    progression: true,
    skirmish: true,
    mapEditor: true,
    tutorial: true,
    sandbox: true,
    customMaps: true
  });
  assert.deepEqual(production.capabilities, {
    run: true,
    progression: true,
    skirmish: false,
    mapEditor: false,
    tutorial: true,
    sandbox: false,
    customMaps: false
  });
  assert.notEqual(
    development.identity.storageNamespace,
    production.identity.storageNamespace
  );
  assert.notEqual(development.identity.appId, production.identity.appId);
});

test("production title keeps run utilities and progression while hiding internal modes", () => {
  const html = renderTitleView(
    createTitleState(),
    getBuildProfileConfig(BUILD_PROFILES.PRODUCTION)
  );

  for (const action of [
    "open-new-run",
    "open-continue",
    "open-progression",
    "open-tutorial",
    "open-options",
    "quit-game"
  ]) {
    assert.match(html, new RegExp(`data-action="${action}"`));
  }

  for (const action of [
    "open-skirmish",
    "open-map-editor",
    "open-debug-run"
  ]) {
    assert.doesNotMatch(html, new RegExp(`data-action="${action}"`));
  }
});

test("production controller rejects restricted mode entry points without changing state", async () => {
  const controller = new GameController(null, {
    buildProfile: BUILD_PROFILES.PRODUCTION
  });
  const originalState = controller.getState();

  assert.equal(controller.openSkirmish(), false);
  assert.equal(controller.openMapEditor(), false);
  assert.equal(controller.startDebugRun(), false);
  assert.equal(await controller.startSkirmish(), false);
  assert.deepEqual(controller.getState(), originalState);

  assert.equal(controller.openTutorial(), true);
  assert.equal(controller.getState().screen, SCREEN_IDS.TUTORIAL);
  assert.equal(controller.startTutorialBattle(), true);
  assert.equal(controller.getState().screen, SCREEN_IDS.BATTLE);

  controller.state.screen = SCREEN_IDS.MAP_EDITOR;
  controller.emit();
  assert.equal(controller.getState().screen, SCREEN_IDS.TITLE);
});

test("production initialization skips and clears custom maps", async () => {
  let listCustomMapsCalls = 0;
  const controller = new GameController(
    {
      async loadMeta() {
        return null;
      },
      async listSlots() {
        return [];
      },
      async listCustomMaps() {
        listCustomMapsCalls += 1;
        return [];
      }
    },
    { buildProfile: BUILD_PROFILES.PRODUCTION }
  );

  await controller.initialize();

  assert.equal(listCustomMapsCalls, 0);
  assert.equal(controller.isFeatureEnabled(BUILD_FEATURES.CUSTOM_MAPS), false);
});

test("storage repositories use profile-specific browser namespaces", () => {
  const development = new StorageRepository({
    buildProfile: BUILD_PROFILES.DEVELOPMENT
  });
  const production = new StorageRepository({
    buildProfile: BUILD_PROFILES.PRODUCTION
  });

  assert.equal(development.metaKey, "ash-run-84:development:meta");
  assert.equal(production.metaKey, "ash-run-84:alpha:meta");
  assert.notEqual(development.slotKeyPrefix, production.slotKeyPrefix);
});
