import test from "node:test";
import assert from "node:assert/strict";
import { BUILDING_KEYS, TERRAIN_KEYS, TURN_SIDES } from "../src/game/core/constants.js";
import { MAP_POOL } from "../src/game/content/maps.js";
import { MAP_GOAL_TYPES } from "../src/game/content/mapGoals.js";

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

function isTileInBounds(map, tile) {
  return (
    Number.isInteger(tile?.x) &&
    Number.isInteger(tile?.y) &&
    tile.x >= 0 &&
    tile.y >= 0 &&
    tile.x < map.width &&
    tile.y < map.height
  );
}

test("authored map pool exposes runtime-ready map definitions", () => {
  assert.ok(MAP_POOL.length > 0, "the live map pool should include authored maps");

  for (const map of MAP_POOL) {
    assert.equal(map.tiles.length, map.height, `${map.id} should expose ${map.height} tile rows`);
    assert.ok(map.tiles.every((row) => row.length === map.width), `${map.id} should keep each tile row at width ${map.width}`);
    assert.ok(map.buildings.length > 0, `${map.id} should include at least one building`);
    assert.ok(
      map.buildings.some(
        (building) => building.owner === TURN_SIDES.PLAYER && building.type === BUILDING_KEYS.COMMAND
      ),
      `${map.id} should include a player command post`
    );

    if ((map.goal?.type ?? MAP_GOAL_TYPES.ROUT) === MAP_GOAL_TYPES.HQ_CAPTURE) {
      assert.ok(
        map.buildings.some(
          (building) => building.owner === TURN_SIDES.ENEMY && building.type === BUILDING_KEYS.COMMAND
        ),
        `${map.id} should include an enemy HQ for hq-capture goals`
      );
    }

    const buildingIds = new Set();
    for (const building of map.buildings) {
      assert.ok(isTileInBounds(map, building), `${map.id} building ${building.id} should stay in bounds`);
      assert.equal(buildingIds.has(building.id), false, `${map.id} should keep building ids unique`);
      buildingIds.add(building.id);
    }

    const unitIds = new Set();
    for (const unit of map.units ?? []) {
      assert.ok(isTileInBounds(map, unit), `${map.id} unit ${unit.id} should stay in bounds`);
      assert.equal(unitIds.has(unit.id), false, `${map.id} should keep unit ids unique`);
      unitIds.add(unit.id);
    }
  }
});

test("authored maps with opposing command posts avoid single-tile route stalls", () => {
  const opposingCommandMaps = MAP_POOL.filter(
    (map) =>
      map.buildings.some(
        (building) => building.owner === TURN_SIDES.PLAYER && building.type === BUILDING_KEYS.COMMAND
      ) &&
      map.buildings.some(
        (building) => building.owner === TURN_SIDES.ENEMY && building.type === BUILDING_KEYS.COMMAND
      )
  );

  assert.ok(opposingCommandMaps.length > 0, "the route redundancy check should cover at least one authored map");

  for (const map of opposingCommandMaps) {
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

test("authored map pool keeps forests and mountains tactically relevant across the rotation", () => {
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
