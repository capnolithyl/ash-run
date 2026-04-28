import test from "node:test";
import assert from "node:assert/strict";
import { BUILDING_KEYS, TERRAIN_KEYS, TURN_SIDES } from "../src/game/core/constants.js";
import { MAP_POOL } from "../src/game/content/maps.js";
import { createBattlefield } from "../src/game/content/mapFactory.js";

function tileKey(x, y) {
  return `${x},${y}`;
}

function isPassable(tile) {
  return tile !== TERRAIN_KEYS.WATER && tile !== TERRAIN_KEYS.RIDGE;
}

function getGroundNeighbors(map, x, y) {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 }
  ].filter((tile) => isPassable(map.tiles[tile.y]?.[tile.x]));
}

function hasRouteWithoutTile(map, start, goal, blockedTileKey) {
  if ([tileKey(start.x, start.y), tileKey(goal.x, goal.y)].includes(blockedTileKey)) {
    return false;
  }

  const queue = [start];
  const visited = new Set([tileKey(start.x, start.y)]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.x === goal.x && current.y === goal.y) {
      return true;
    }

    for (const neighbor of getGroundNeighbors(map, current.x, current.y)) {
      const key = tileKey(neighbor.x, neighbor.y);

      if (key === blockedTileKey || visited.has(key)) {
        continue;
      }

      visited.add(key);
      queue.push(neighbor);
    }
  }

  return false;
}

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

test("map pool avoids single-tile stall points on command routes", () => {
  for (const map of MAP_POOL) {
    const playerCommand = map.buildings.find(
      (building) => building.owner === TURN_SIDES.PLAYER && building.type === BUILDING_KEYS.COMMAND
    );
    const enemyCommand = map.buildings.find(
      (building) => building.owner === TURN_SIDES.ENEMY && building.type === BUILDING_KEYS.COMMAND
    );
    const commandKeys = new Set([
      tileKey(playerCommand.x, playerCommand.y),
      tileKey(enemyCommand.x, enemyCommand.y)
    ]);

    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const key = tileKey(x, y);

        if (!isPassable(map.tiles[y][x]) || commandKeys.has(key)) {
          continue;
        }

        assert.equal(
          hasRouteWithoutTile(map, playerCommand, enemyCommand, key),
          true,
          `${map.id} should not rely on ${key} as a single command-route tile`
        );
      }
    }
  }
});

test("map pool uses varied layouts, sizes, and service buildings", () => {
  const layouts = new Set(MAP_POOL.map((map) => map.layout));
  const sizeKeys = new Set(MAP_POOL.map((map) => `${map.width}x${map.height}`));
  const areas = MAP_POOL.map((map) => map.width * map.height);

  assert.ok(layouts.has("east-west"));
  assert.ok(layouts.has("north-south"));
  assert.ok(layouts.has("corner"));
  assert.ok(layouts.has("center-ring"));
  assert.ok(sizeKeys.size >= 8, "map pool should include a broad spread of board dimensions");
  assert.ok(Math.min(...areas) <= 180, "map pool should include compact skirmish boards");
  assert.ok(Math.max(...areas) >= 400, "map pool should include large encounter boards");

  for (const map of MAP_POOL) {
    assert.ok(map.width >= 16, `${map.id} should remain wide enough for production and route placement`);
    assert.ok(map.height >= 10, `${map.id} should remain tall enough for production and route placement`);
    assert.ok(
      map.buildings.some((building) => building.type === BUILDING_KEYS.HOSPITAL),
      `${map.id} should include a hospital`
    );
    assert.ok(
      map.buildings.some((building) => building.type === BUILDING_KEYS.REPAIR_STATION),
      `${map.id} should include a repair station`
    );
  }
});

test("map pool keeps forests and mountains tactically relevant across the rotation", () => {
  let forestTiles = 0;
  let mountainTiles = 0;
  let totalTiles = 0;

  for (const map of MAP_POOL) {
    let mapForestTiles = 0;
    let mapMountainTiles = 0;

    for (const row of map.tiles) {
      for (const tile of row) {
        totalTiles += 1;

        if (tile === TERRAIN_KEYS.FOREST) {
          forestTiles += 1;
          mapForestTiles += 1;
        } else if (tile === TERRAIN_KEYS.MOUNTAIN) {
          mountainTiles += 1;
          mapMountainTiles += 1;
        }
      }
    }

    const tacticalTerrain = mapForestTiles + mapMountainTiles;
    const minimumTacticalTiles = Math.max(8, Math.floor(map.width * map.height * 0.04));

    assert.ok(mapForestTiles > 0, `${map.id} should include at least one forest tile`);
    assert.ok(mapMountainTiles > 0, `${map.id} should include at least one mountain tile`);
    assert.ok(
      tacticalTerrain >= minimumTacticalTiles,
      `${map.id} should include enough forests/mountains to create flanking cover`
    );
  }

  assert.ok(forestTiles / totalTiles >= 0.05, "map pool should use forests for meaningful cover lanes");
  assert.ok(mountainTiles / totalTiles >= 0.015, "map pool should use mountains for elevation pressure");
});
