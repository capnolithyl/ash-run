import test from "node:test";
import assert from "node:assert/strict";
import { getTerrainClusterPlacements } from "../src/game/phaser/view/terrainClusters.js";

function summarizePlacements(tiles) {
  const { placements, coveredTiles } = getTerrainClusterPlacements(tiles);

  return {
    placements: placements.map(({ terrainId, shape, x, y, widthTiles, heightTiles, assetId }) => ({
      terrainId,
      shape,
      x,
      y,
      widthTiles,
      heightTiles,
      assetId,
    })),
    coveredTiles: [...coveredTiles].sort(),
  };
}

test("exact 2x2 mountain square resolves to one 2x2 placement", () => {
  const summary = summarizePlacements([
    ["mountain", "mountain"],
    ["mountain", "mountain"],
  ]);

  assert.deepEqual(summary.placements, [
    {
      terrainId: "mountain",
      shape: "2x2",
      x: 0,
      y: 0,
      widthTiles: 2,
      heightTiles: 2,
      assetId: "mountain_2x2",
    }
  ]);
  assert.deepEqual(summary.coveredTiles, ["0,0", "0,1", "1,0", "1,1"]);
});

test("exact horizontal pair resolves to one 2x1 placement", () => {
  const summary = summarizePlacements([
    ["mountain", "mountain", "ridge"],
  ]);

  assert.deepEqual(summary.placements, [
    {
      terrainId: "mountain",
      shape: "2x1",
      x: 0,
      y: 0,
      widthTiles: 2,
      heightTiles: 1,
      assetId: "mountain_2x1",
    }
  ]);
  assert.deepEqual(summary.coveredTiles, ["0,0", "1,0"]);
});

test("exact vertical pair resolves to one 1x2 placement", () => {
  const summary = summarizePlacements([
    ["mountain", "ridge"],
    ["mountain", "ridge"],
  ]);

  assert.deepEqual(summary.placements, [
    {
      terrainId: "mountain",
      shape: "1x2",
      x: 0,
      y: 0,
      widthTiles: 1,
      heightTiles: 2,
      assetId: "mountain_1x2",
    }
  ]);
  assert.deepEqual(summary.coveredTiles, ["0,0", "0,1"]);
});

test("larger mountain rectangle uses multiple 2x2 variants before smaller mountain variants", () => {
  const summary = summarizePlacements([
    ["mountain", "mountain", "mountain", "mountain"],
    ["mountain", "mountain", "mountain", "mountain"],
    ["ridge", "ridge", "mountain", "ridge"],
  ]);

  assert.deepEqual(summary.placements, [
    {
      terrainId: "mountain",
      shape: "2x2",
      x: 0,
      y: 0,
      widthTiles: 2,
      heightTiles: 2,
      assetId: "mountain_2x2",
    },
    {
      terrainId: "mountain",
      shape: "2x2",
      x: 2,
      y: 0,
      widthTiles: 2,
      heightTiles: 2,
      assetId: "mountain_2x2",
    }
  ]);
  assert.deepEqual(summary.coveredTiles, ["0,0", "0,1", "1,0", "1,1", "2,0", "2,1", "3,0", "3,1"]);
});

test("leftover mountains use horizontal pairs before vertical pairs after 2x2 claims", () => {
  const summary = summarizePlacements([
    ["mountain", "mountain", "mountain", "mountain"],
    ["mountain", "mountain", "ridge", "ridge"],
  ]);

  assert.deepEqual(summary.placements, [
    {
      terrainId: "mountain",
      shape: "2x2",
      x: 0,
      y: 0,
      widthTiles: 2,
      heightTiles: 2,
      assetId: "mountain_2x2",
    },
    {
      terrainId: "mountain",
      shape: "2x1",
      x: 2,
      y: 0,
      widthTiles: 2,
      heightTiles: 1,
      assetId: "mountain_2x1",
    }
  ]);
  assert.deepEqual(summary.coveredTiles, ["0,0", "0,1", "1,0", "1,1", "2,0", "3,0"]);
});

test("leftover mountains use vertical pairs when no horizontal pair remains after 2x2 claims", () => {
  const summary = summarizePlacements([
    ["mountain", "mountain", "mountain"],
    ["mountain", "mountain", "mountain"],
    ["ridge", "ridge", "mountain"],
  ]);

  assert.deepEqual(summary.placements, [
    {
      terrainId: "mountain",
      shape: "2x2",
      x: 0,
      y: 0,
      widthTiles: 2,
      heightTiles: 2,
      assetId: "mountain_2x2",
    },
    {
      terrainId: "mountain",
      shape: "1x2",
      x: 2,
      y: 0,
      widthTiles: 1,
      heightTiles: 2,
      assetId: "mountain_1x2",
    }
  ]);
  assert.deepEqual(summary.coveredTiles, ["0,0", "0,1", "1,0", "1,1", "2,0", "2,1"]);
});

test("leftover mountain cells remain uncovered when no cluster shape claims them", () => {
  const summary = summarizePlacements([
    ["mountain", "mountain", "ridge"],
    ["ridge", "mountain", "ridge"],
  ]);

  assert.deepEqual(summary.placements, [
    {
      terrainId: "mountain",
      shape: "2x1",
      x: 0,
      y: 0,
      widthTiles: 2,
      heightTiles: 1,
      assetId: "mountain_2x1",
    }
  ]);
  assert.deepEqual(summary.coveredTiles, ["0,0", "1,0"]);
});

test("exact 2x2 forest square resolves to one 2x2 placement", () => {
  const summary = summarizePlacements([
    ["forest", "forest"],
    ["forest", "forest"],
  ]);

  assert.deepEqual(summary.placements, [
    {
      terrainId: "forest",
      shape: "2x2",
      x: 0,
      y: 0,
      widthTiles: 2,
      heightTiles: 2,
      assetId: "forest_2x2",
    }
  ]);
  assert.deepEqual(summary.coveredTiles, ["0,0", "0,1", "1,0", "1,1"]);
});

test("forest pair variants resolve to the intended horizontal and vertical footprints", () => {
  const horizontal = summarizePlacements([
    ["forest", "forest", "ridge"],
  ]);
  const vertical = summarizePlacements([
    ["forest", "ridge"],
    ["forest", "ridge"],
  ]);

  assert.deepEqual(horizontal.placements, [
    {
      terrainId: "forest",
      shape: "2x1",
      x: 0,
      y: 0,
      widthTiles: 2,
      heightTiles: 1,
      assetId: "forest_1x2",
    }
  ]);
  assert.deepEqual(horizontal.coveredTiles, ["0,0", "1,0"]);

  assert.deepEqual(vertical.placements, [
    {
      terrainId: "forest",
      shape: "1x2",
      x: 0,
      y: 0,
      widthTiles: 1,
      heightTiles: 2,
      assetId: "forest_2x1",
    }
  ]);
  assert.deepEqual(vertical.coveredTiles, ["0,0", "0,1"]);
});
