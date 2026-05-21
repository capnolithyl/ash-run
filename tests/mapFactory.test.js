import test from "node:test";
import assert from "node:assert/strict";
import { BUILDING_KEYS } from "../src/game/core/constants.js";
import { createBattlefield } from "../src/game/content/mapFactory.js";

test("createBattlefield rejects maps without a ground route between command posts", () => {
  assert.throws(
    () =>
      createBattlefield({
        id: "blocked-route",
        name: "Blocked Route",
        theme: "Validation",
        width: 10,
        height: 6,
        riverColumns: [5],
        bridgeRows: []
      }),
    /valid ground route/
  );
});

test("createBattlefield supports every shipped generator layout with default command and service buildings", () => {
  const layoutSpecs = [
    { id: "layout-east-west", name: "East West", layout: "east-west", width: 18, height: 12 },
    { id: "layout-north-south", name: "North South", layout: "north-south", width: 18, height: 14 },
    { id: "layout-corner", name: "Corner", layout: "corner", width: 20, height: 14 },
    { id: "layout-center-ring", name: "Center Ring", layout: "center-ring", width: 22, height: 16 }
  ];

  for (const spec of layoutSpecs) {
    const map = createBattlefield({
      ...spec,
      theme: "Validation"
    });
    const playerCommand = map.buildings.find(
      (building) => building.owner === "player" && building.type === BUILDING_KEYS.COMMAND
    );
    const enemyCommand = map.buildings.find(
      (building) => building.owner === "enemy" && building.type === BUILDING_KEYS.COMMAND
    );

    assert.equal(map.layout, spec.layout);
    assert.equal(map.width, spec.width);
    assert.equal(map.height, spec.height);
    assert.ok(playerCommand, `${spec.layout} should place a player command post`);
    assert.ok(enemyCommand, `${spec.layout} should place an enemy command post`);
    assert.ok(
      map.buildings.some((building) => building.type === BUILDING_KEYS.HOSPITAL),
      `${spec.layout} should include a neutral hospital`
    );
    assert.ok(
      map.buildings.some((building) => building.type === BUILDING_KEYS.REPAIR_STATION),
      `${spec.layout} should include a neutral repair station`
    );
  }
});
