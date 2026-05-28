import test from "node:test";
import assert from "node:assert/strict";
import { getBattlefieldLayout } from "../src/game/core/battlefieldLayout.js";
import { DISPLAY_RESOLUTION_PRESETS } from "../src/game/core/displayOptions.js";

const WINDOW_CHROME_HEIGHT = 34;

function clampViewportValue(minValue, preferredValue, maxValue) {
  return Math.max(minValue, Math.min(preferredValue, maxValue));
}

function getDesktopLaneBounds(viewportWidth) {
  const desktopLeftPanelWidth = clampViewportValue(17 * 16, viewportWidth * 0.18, 18.75 * 16);
  const desktopRightPanelWidth = clampViewportValue(15 * 16, viewportWidth * 0.16, 16.5 * 16);
  const desktopPanelInset = clampViewportValue(1 * 16, viewportWidth * 0.0125, 1.45 * 16);
  const desktopCenterLaneGap = clampViewportValue(1 * 16, viewportWidth * 0.0115, 1.35 * 16);

  return {
    laneLeft: desktopPanelInset + desktopLeftPanelWidth + desktopCenterLaneGap,
    laneRight: viewportWidth - desktopPanelInset - desktopRightPanelWidth - desktopCenterLaneGap
  };
}

test("desktop battlefield layout keeps the board inside the middle lane", () => {
  const viewportWidth = 1600;
  const viewportHeight = 1000;
  const mapWidth = 12;
  const mapHeight = 10;
  const layout = getBattlefieldLayout({
    viewportWidth,
    viewportHeight,
    mapWidth,
    mapHeight
  });
  const boardLeft = layout.originX;
  const boardRight = layout.originX + mapWidth * layout.cellSize;
  const { laneLeft, laneRight } = getDesktopLaneBounds(viewportWidth);
  const centeredAgainstViewport = Math.round((viewportWidth - mapWidth * layout.cellSize) / 2);

  assert.ok(boardLeft >= Math.round(laneLeft));
  assert.ok(boardRight <= Math.round(laneRight));
  assert.ok(layout.originX > centeredAgainstViewport);
});

test("compact battlefield layout still centers the board against the viewport", () => {
  const viewportWidth = 1024;
  const viewportHeight = 768;
  const mapWidth = 12;
  const mapHeight = 10;
  const layout = getBattlefieldLayout({
    viewportWidth,
    viewportHeight,
    mapWidth,
    mapHeight
  });

  assert.equal(layout.originX, Math.round((viewportWidth - mapWidth * layout.cellSize) / 2));
});

test("official desktop window presets keep the board readable inside the play lane", () => {
  const mapWidth = 12;
  const mapHeight = 10;

  for (const preset of DISPLAY_RESOLUTION_PRESETS) {
    const viewportWidth = preset.width;
    const viewportHeight = preset.height - WINDOW_CHROME_HEIGHT;
    const layout = getBattlefieldLayout({
      viewportWidth,
      viewportHeight,
      mapWidth,
      mapHeight
    });
    const boardLeft = layout.originX;
    const boardRight = layout.originX + mapWidth * layout.cellSize;
    const boardBottom = layout.originY + mapHeight * layout.cellSize;
    const { laneLeft, laneRight } = getDesktopLaneBounds(viewportWidth);

    assert.ok(layout.cellSize >= 40, `${preset.id} cell size should remain readable`);
    assert.ok(boardLeft >= Math.round(laneLeft), `${preset.id} should stay right of left HUD`);
    assert.ok(boardRight <= Math.round(laneRight), `${preset.id} should stay left of right HUD`);
    assert.ok(boardBottom <= viewportHeight - 92, `${preset.id} should clear footer controls`);
  }
});
