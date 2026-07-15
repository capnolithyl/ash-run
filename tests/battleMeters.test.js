import test from "node:test";
import assert from "node:assert/strict";
import { appShellBattleMeterMethods } from "../src/ui/appShell/render/battleMeters.js";

function createMeterFill(value) {
  return {
    dataset: {
      meterValue: `${value}`
    }
  };
}

function createUnitCard({ unitId = "unit-1", hp = 100, stamina = 100, xp = 6 } = {}) {
  const fills = {
    '[data-meter-fill="hp"]': createMeterFill(hp),
    '[data-meter-fill="stamina"]': createMeterFill(stamina),
    '.selection-section--xp [data-meter-fill="xp"]': createMeterFill(xp)
  };

  return {
    dataset: {
      selectionUnitCard: unitId
    },
    querySelector(selector) {
      return fills[selector] ?? null;
    }
  };
}

test("battle meter state captures stamina alongside HP and experience", () => {
  const card = createUnitCard({ hp: 75, stamina: 50, xp: 24 });
  const meterState = appShellBattleMeterMethods.captureBattleMeterState.call({
    root: {
      querySelectorAll() {
        return [card];
      }
    }
  });

  assert.deepEqual(meterState.get("unit-1"), {
    hp: 75,
    stamina: 50,
    xp: 24
  });
});

test("battle meter animation routes stamina losses through the shared fill animator", () => {
  const originalWindow = globalThis.window;
  const card = createUnitCard({ hp: 100, stamina: 40 });
  const calls = [];
  globalThis.window = {
    matchMedia() {
      return { matches: false };
    }
  };

  try {
    appShellBattleMeterMethods.animateBattleMeters.call(
      {
        root: {
          querySelectorAll() {
            return [card];
          }
        },
        animateBattleMeterFill(fill, from, to, options) {
          calls.push({ fill, from, to, options });
        }
      },
      new Map([
        [
          "unit-1",
          {
            hp: 100,
            stamina: 80,
            xp: 6
          }
        ]
      ])
    );
  } finally {
    globalThis.window = originalWindow;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].from, 80);
  assert.equal(calls[0].to, 40);
  assert.equal(calls[0].options.emphasisClass, "is-animating-loss");
});
