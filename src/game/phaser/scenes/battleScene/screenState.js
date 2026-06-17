import { BATTLE_TURN_BANNER_SETTLE_MS, SCREEN_IDS } from "../../../core/constants.js";
import { createMapEditorSnapshot } from "../../../content/mapEditor.js";
import { getMovementPath, getSelectedUnit } from "../../../simulation/selectors.js";

export function isBattleScreen(state) {
  return state?.screen === SCREEN_IDS.BATTLE && state?.battleSnapshot;
}

export function isMapEditorScreen(state) {
  return state?.screen === SCREEN_IDS.MAP_EDITOR && state?.mapEditor?.mapData;
}

export function isBoardScreen(state) {
  return isBattleScreen(state) || isMapEditorScreen(state);
}

export function getBoardSnapshot(state, hoveredTile = null) {
  if (isBattleScreen(state)) {
    return state.battleSnapshot;
  }

  if (isMapEditorScreen(state)) {
    return createMapEditorSnapshot(
      state.mapEditor.mapData,
      state.mapEditor.selectedTile,
      hoveredTile,
      state.mapEditor.mirrorMode,
      state.mapEditor.selectedReinforcementWaveId
    );
  }

  return null;
}

export function getHoveredMovementPath(snapshot, hoveredTile) {
  const presentation = snapshot.presentation ?? {};
  const selectedUnit = getSelectedUnit(snapshot);
  const isSlipstream =
    presentation.pendingAction?.unitId === selectedUnit?.id &&
    presentation.pendingAction?.isSlipstream;

  if (
    !hoveredTile ||
    !selectedUnit ||
    selectedUnit.owner !== "player" ||
    snapshot.turn.activeSide !== "player" ||
    (!isSlipstream && selectedUnit.hasMoved) ||
    (presentation.pendingAction?.unitId === selectedUnit.id && !isSlipstream)
  ) {
    return [];
  }

  const isReachable = presentation.reachableTiles?.some(
    (tile) => tile.x === hoveredTile.x && tile.y === hoveredTile.y
  );

  if (!isReachable) {
    return [];
  }

  return getMovementPath(
    snapshot,
    selectedUnit,
    presentation.movementBudget ?? selectedUnit.stats.movement,
    hoveredTile.x,
    hoveredTile.y
  );
}

export function getTurnTransitionDelay(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot || previousSnapshot.turn.activeSide === nextSnapshot.turn.activeSide) {
    return 0;
  }

  return BATTLE_TURN_BANNER_SETTLE_MS;
}

export function getHoveredAttackForecast(snapshot, hoveredTile) {
  if (!hoveredTile) {
    return null;
  }

  const presentation = snapshot.presentation ?? {};
  const pendingAction = presentation.pendingAction;
  const isTargeting = pendingAction?.isTargeting && pendingAction?.mode === "fire";

  if (!isTargeting) {
    return null;
  }

  const hoveredEnemy = snapshot.enemy.units.find(
    (unit) => unit.current.hp > 0 && unit.x === hoveredTile.x && unit.y === hoveredTile.y
  );

  if (!hoveredEnemy) {
    return null;
  }

  const forecast = presentation.attackForecasts?.[hoveredEnemy.id] ?? null;

  if (!forecast) {
    return null;
  }

  return {
    ...forecast,
    targetName: hoveredEnemy.name
  };
}
