import test from "node:test";
import assert from "node:assert/strict";
import { PHASER_RENDERER_TYPE } from "../src/game/phaser/rendererConfig.js";
import { VisualEffectsManager } from "../src/game/phaser/view/VisualEffectsManager.js";

function createFakePlate() {
  return {
    destroyed: false,
    postFX: {
      remove() {}
    },
    setOrigin() {
      return this;
    },
    setDepth() {
      return this;
    },
    setScrollFactor() {
      return this;
    },
    setVisible() {
      return this;
    },
    setAlpha() {
      return this;
    },
    setPosition() {
      return this;
    },
    setSize() {
      return this;
    },
    setDisplaySize() {
      return this;
    },
    setFillStyle() {
      return this;
    },
    destroy() {
      this.destroyed = true;
    }
  };
}

function createFakeScene(rendererType = PHASER_RENDERER_TYPE.CANVAS) {
  return {
    game: {
      renderer: {
        type: rendererType,
        pipelines: rendererType === PHASER_RENDERER_TYPE.WEBGL ? {} : null
      }
    },
    scale: {
      width: 1280,
      height: 720
    },
    add: {
      rectangle() {
        return createFakePlate();
      }
    },
    time: {
      delayedCall(delay, callback) {
        void delay;
        void callback;
        return {
          remove() {}
        };
      }
    },
    tweens: {
      killed: [],
      add(config) {
        config.onComplete?.();
        return {
          on() {},
          setCallback() {},
          stop() {}
        };
      },
      killTweensOf(target) {
        this.killed.push(target);
      }
    }
  };
}

test("visual effects manager becomes a clean no-op when WebGL FX are unavailable", () => {
  const scene = createFakeScene(PHASER_RENDERER_TYPE.CANVAS);
  const manager = new VisualEffectsManager(scene);

  const result = manager.syncBattlefield({
    requestedQuality: "full",
    snapshot: {
      player: { units: [] },
      enemy: { units: [] },
      selection: { type: null },
      presentation: {}
    },
    selectionLayer: {
      getFxTargets() {
        return {
          rangeGraphics: {
            postFX: {
              addGlow() {
                throw new Error("selection FX should not run on canvas");
              }
            }
          }
        };
      },
      getFxState() {
        return {
          hasRangeHighlights: true,
          hasFocusHighlights: false,
          hasBuildingHighlights: false
        };
      }
    },
    unitLayer: {
      getEntity() {
        throw new Error("unit FX should not run on canvas");
      }
    },
    combatCutsceneActive: true
  });

  assert.equal(result, "off");
  assert.equal(manager.effectiveQuality, "off");
  assert.equal(scene.tweens.killed.length, 2);

  manager.destroy();

  assert.equal(manager.combatPlate.destroyed, true);
  assert.equal(manager.powerPlate.destroyed, true);
});
