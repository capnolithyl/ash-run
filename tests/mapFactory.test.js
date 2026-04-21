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
