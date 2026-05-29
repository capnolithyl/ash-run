import test from "node:test";
import assert from "node:assert/strict";
import { getTerrainTransitionPlacements } from "../src/game/phaser/view/terrainTransitions.js";

test("water tile with one plain neighbor gets one shoal overlay rotated toward that edge", () => {
  const tiles = [
    ["ridge", "plain", "ridge"],
    ["ridge", "water", "ridge"],
    ["ridge", "ridge", "ridge"],
  ];

  const placements = getTerrainTransitionPlacements(tiles, 1, 1);

  assert.deepEqual(
    placements.map(({ assetId, direction, rotationDegrees }) => ({
      assetId,
      direction,
      rotationDegrees
    })),
    [{
      assetId: "shoal",
      direction: "north",
      rotationDegrees: 0
    }]
  );
});

test("water tile with multiple orthogonal plain neighbors stacks one overlay per side", () => {
  const tiles = [
    ["ridge", "plain", "ridge"],
    ["plain", "water", "plain"],
    ["ridge", "plain", "ridge"],
  ];

  const placements = getTerrainTransitionPlacements(tiles, 1, 1);

  assert.deepEqual(
    placements.map(({ direction, rotationDegrees }) => ({
      direction,
      rotationDegrees
    })),
    [
      { direction: "north", rotationDegrees: 0 },
      { direction: "east", rotationDegrees: 90 },
      { direction: "south", rotationDegrees: 180 },
      { direction: "west", rotationDegrees: -90 }
    ]
  );
});

test("water tile uses the shoal overlay for forest and mountain neighbors too", () => {
  const tiles = [
    ["ridge", "forest", "ridge"],
    ["mountain", "water", "forest"],
    ["ridge", "ridge", "ridge"],
  ];

  const placements = getTerrainTransitionPlacements(tiles, 1, 1);

  assert.deepEqual(
    placements.map(({ assetId, direction, rotationDegrees }) => ({
      assetId,
      direction,
      rotationDegrees
    })),
    [
      { assetId: "shoal", direction: "north", rotationDegrees: 0 },
      { assetId: "shoal", direction: "east", rotationDegrees: 90 },
      { assetId: "shoal", direction: "west", rotationDegrees: -90 }
    ]
  );
});

test("water tile uses the edge overlay for road neighbors", () => {
  const tiles = [
    ["ridge", "road", "ridge"],
    ["ridge", "water", "ridge"],
    ["ridge", "ridge", "ridge"],
  ];

  const placements = getTerrainTransitionPlacements(tiles, 1, 1);

  assert.deepEqual(
    placements.map(({ assetId, direction, rotationDegrees }) => ({
      assetId,
      direction,
      rotationDegrees
    })),
    [
      { assetId: "edge", direction: "north", rotationDegrees: 0 }
    ]
  );
});

test("road tile uses the roadside overlay for plain neighbors", () => {
  const tiles = [
    ["ridge", "plain", "ridge"],
    ["ridge", "road", "ridge"],
    ["ridge", "ridge", "ridge"],
  ];

  const placements = getTerrainTransitionPlacements(tiles, 1, 1);

  assert.deepEqual(
    placements.map(({ assetId, direction, rotationDegrees }) => ({
      assetId,
      direction,
      rotationDegrees
    })),
    [
      { assetId: "roadside", direction: "north", rotationDegrees: 0 }
    ]
  );
});

test("road tile uses the roadside overlay for forest and mountain neighbors too", () => {
  const tiles = [
    ["ridge", "forest", "ridge"],
    ["mountain", "road", "forest"],
    ["ridge", "ridge", "ridge"],
  ];

  const placements = getTerrainTransitionPlacements(tiles, 1, 1);

  assert.deepEqual(
    placements.map(({ assetId, direction, rotationDegrees }) => ({
      assetId,
      direction,
      rotationDegrees
    })),
    [
      { assetId: "roadside", direction: "north", rotationDegrees: 0 },
      { assetId: "roadside", direction: "east", rotationDegrees: 90 },
      { assetId: "roadside", direction: "west", rotationDegrees: -90 }
    ]
  );
});

test("diagonal-only plain contact does not create a shoal overlay", () => {
  const tiles = [
    ["plain", "ridge", "ridge"],
    ["ridge", "water", "ridge"],
    ["ridge", "ridge", "ridge"],
  ];

  assert.deepEqual(getTerrainTransitionPlacements(tiles, 1, 1), []);
});

test("non-matching neighbor terrain does not create a shoal overlay", () => {
  const tiles = [
    ["ridge", "ridge", "ridge"],
    ["ridge", "water", "ridge"],
    ["ridge", "ridge", "ridge"],
  ];

  assert.deepEqual(getTerrainTransitionPlacements(tiles, 1, 1), []);
});
