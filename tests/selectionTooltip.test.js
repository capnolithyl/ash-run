import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBattlefieldNameTooltip,
  buildForecastTooltipLabel
} from "../src/game/phaser/view/selectionTooltip.js";

function createTooltipSnapshot({ playerUnits = [], enemyUnits = [], buildings = [] } = {}) {
  return {
    player: {
      units: playerUnits
    },
    enemy: {
      units: enemyUnits
    },
    map: {
      buildings
    }
  };
}

function createUnit(overrides = {}) {
  return {
    id: "unit-1",
    name: "Grunt",
    owner: "player",
    x: 2,
    y: 3,
    current: {
      hp: 100
    },
    ...overrides
  };
}

test("forecast tooltip label includes the hovered enemy name above the numbers", () => {
  const label = buildForecastTooltipLabel({
    targetName: "Runner",
    dealt: { min: 12, max: 18 },
    received: { min: 4, max: 6 }
  });

  assert.equal(label, "Runner\nDamage 12-18\nCounter 4-6");
});

test("forecast tooltip label falls back cleanly when no counter is possible", () => {
  const label = buildForecastTooltipLabel({
    targetName: "Bruiser",
    dealt: { min: 20, max: 20 },
    received: null
  });

  assert.equal(label, "Bruiser\nDamage 20-20\nCounter 0");
});

test("battlefield name tooltip shows a visible unit on the hovered tile", () => {
  const snapshot = createTooltipSnapshot({
    playerUnits: [createUnit({ name: "Runner", owner: "player" })]
  });

  assert.deepEqual(buildBattlefieldNameTooltip(snapshot, { x: 2, y: 3 }), {
    primary: {
      type: "unit",
      label: "Runner",
      owner: "player"
    },
    secondary: null
  });
});

test("battlefield name tooltip shows a custom identity with its catalog type", () => {
  const snapshot = createTooltipSnapshot({
    playerUnits: [createUnit({ name: "Mara", unitTypeId: "grunt", owner: "player" })]
  });

  assert.equal(
    buildBattlefieldNameTooltip(snapshot, { x: 2, y: 3 }).primary.label,
    "Mara \u2014 Grunt"
  );
});

test("battlefield name tooltip shows a building on an empty hovered tile", () => {
  const snapshot = createTooltipSnapshot({
    buildings: [
      {
        id: "building-1",
        type: "barracks",
        owner: "enemy",
        x: 2,
        y: 3
      }
    ]
  });

  assert.deepEqual(buildBattlefieldNameTooltip(snapshot, { x: 2, y: 3 }), {
    primary: {
      type: "building",
      label: "Barracks",
      owner: "enemy"
    },
    secondary: null
  });
});

test("battlefield name tooltip shows a unit above a building on occupied tiles", () => {
  const snapshot = createTooltipSnapshot({
    playerUnits: [createUnit({ name: "Medic", owner: "player" })],
    buildings: [
      {
        id: "building-1",
        type: "hospital",
        owner: null,
        x: 2,
        y: 3
      }
    ]
  });

  assert.deepEqual(buildBattlefieldNameTooltip(snapshot, { x: 2, y: 3 }), {
    primary: {
      type: "unit",
      label: "Medic",
      owner: "player"
    },
    secondary: {
      type: "building",
      label: "Hospital",
      owner: null
    }
  });
});

test("battlefield name tooltip is hidden on empty tiles", () => {
  const snapshot = createTooltipSnapshot({
    playerUnits: [createUnit()]
  });

  assert.equal(buildBattlefieldNameTooltip(snapshot, { x: 1, y: 1 }), null);
});

test("battlefield name tooltip ignores dead units and falls back to buildings", () => {
  const snapshot = createTooltipSnapshot({
    playerUnits: [createUnit({ current: { hp: 0 } })],
    buildings: [
      {
        id: "building-1",
        type: "sector",
        owner: "player",
        x: 2,
        y: 3
      }
    ]
  });

  assert.deepEqual(buildBattlefieldNameTooltip(snapshot, { x: 2, y: 3 }), {
    primary: {
      type: "building",
      label: "Sector Node",
      owner: "player"
    },
    secondary: null
  });
});

test("battlefield name tooltip ignores carried units and falls back to buildings", () => {
  const snapshot = createTooltipSnapshot({
    playerUnits: [
      createUnit({
        name: "Passenger",
        transport: {
          carriedByUnitId: "carrier-1"
        }
      })
    ],
    buildings: [
      {
        id: "building-1",
        type: "command",
        owner: "player",
        x: 2,
        y: 3
      }
    ]
  });

  assert.deepEqual(buildBattlefieldNameTooltip(snapshot, { x: 2, y: 3 }), {
    primary: {
      type: "building",
      label: "Command Post",
      owner: "player"
    },
    secondary: null
  });
});
