import { TURN_SIDES } from "../../../game/core/constants.js";
import { getCommanderPortraitImageUrl } from "../../../game/content/commanderArt.js";
import { getCommanderPowerMax } from "../../../game/content/commanders.js";

const COMMANDER_POWER_SEGMENT_VALUE = 25;
const COMMANDER_POWER_SEGMENT_HALF_STEPS = 2;

export function canSelectNextReadyUnit(battleSnapshot) {
  if (
    !battleSnapshot ||
    battleSnapshot.victory ||
    battleSnapshot.turn.activeSide !== TURN_SIDES.PLAYER ||
    battleSnapshot.presentation?.pendingAction
  ) {
    return false;
  }

  return battleSnapshot.player.units.some((unit) => !unit.hasMoved && unit.current.hp > 0);
}

export function canActivatePlayerPower(battleSnapshot) {
  return Boolean(
    battleSnapshot &&
      !battleSnapshot.victory &&
      battleSnapshot.turn.activeSide === TURN_SIDES.PLAYER &&
      !battleSnapshot.presentation?.pendingAction &&
      battleSnapshot.player.powerUsedTurn !== battleSnapshot.turn.number &&
      battleSnapshot.player.charge >= getCommanderPowerMax(battleSnapshot.player.commanderId)
  );
}

export function isPlayerPowerCharged(battleSnapshot) {
  if (!battleSnapshot) {
    return false;
  }

  return battleSnapshot.player.charge >= getCommanderPowerMax(battleSnapshot.player.commanderId);
}

function getCommanderPowerSegmentCount(powerMax) {
  return Math.max(1, Math.ceil(powerMax / COMMANDER_POWER_SEGMENT_VALUE));
}

function getCommanderPowerHalfSteps(charge, powerMax, isActive = false) {
  const segmentCount = getCommanderPowerSegmentCount(powerMax);

  if (isActive) {
    return segmentCount * COMMANDER_POWER_SEGMENT_HALF_STEPS;
  }

  const clampedCharge = Math.max(0, Math.min(powerMax, Number(charge) || 0));

  return Math.max(
    0,
    Math.min(
      segmentCount * COMMANDER_POWER_SEGMENT_HALF_STEPS,
      Math.floor(
        (clampedCharge / COMMANDER_POWER_SEGMENT_VALUE) * COMMANDER_POWER_SEGMENT_HALF_STEPS + Number.EPSILON
      )
    )
  );
}

function renderCommanderPowerSegments(sideState, powerMax, { isActive = false } = {}) {
  const segmentCount = getCommanderPowerSegmentCount(powerMax);
  const filledHalfSteps = getCommanderPowerHalfSteps(sideState.charge, powerMax, isActive);
  const displayCharge = Math.max(0, Math.min(powerMax, Math.floor(Number(sideState.charge) || 0)));
  const segments = Array.from({ length: segmentCount }, (_, index) => {
    const segmentHalfSteps = Math.max(
      0,
      Math.min(COMMANDER_POWER_SEGMENT_HALF_STEPS, filledHalfSteps - index * COMMANDER_POWER_SEGMENT_HALF_STEPS)
    );
    const segmentState =
      segmentHalfSteps >= COMMANDER_POWER_SEGMENT_HALF_STEPS
        ? "full"
        : segmentHalfSteps === 1
          ? "half"
          : "empty";

    return `<span class="commander-meter__segment commander-meter__segment--${segmentState}" aria-hidden="true"></span>`;
  }).join("");
  const ariaLabel = isActive
    ? "Commander power active. Meter is fully charged."
    : `Commander power ${displayCharge} of ${powerMax}. Each segment is worth ${COMMANDER_POWER_SEGMENT_VALUE} points.`;

  return `
    <div
      class="meter__bar commander-meter__segments ${isActive ? "commander-meter__segments--active" : ""}"
      style="--meter-segment-count:${segmentCount}"
      data-segment-count="${segmentCount}"
      data-segment-value="${COMMANDER_POWER_SEGMENT_VALUE}"
      data-filled-half-steps="${filledHalfSteps}"
      role="img"
      aria-label="${ariaLabel}"
    >
      ${segments}
    </div>
  `;
}

function renderCommanderPowerControl(
  commander,
  sideState,
  side,
  { canActivatePower = false, isCharged = false, isActive = false } = {}
) {
  const powerMax = getCommanderPowerMax(sideState.commanderId);
  const statusLabel =
    isActive
      ? "Active This Turn"
      : canActivatePower
        ? "Activate Power"
        : isCharged
          ? "Ready Next Turn"
          : "Charging";

  if (side !== TURN_SIDES.PLAYER) {
    return `
      <div
        class="commander-power-button commander-power-button--readonly ${isCharged ? "commander-power-button--charged" : ""} ${isActive ? "commander-power-button--active" : ""}"
        aria-disabled="true"
      >
        <div class="meter commander-meter commander-meter--interactive">
          ${renderCommanderPowerSegments(sideState, powerMax, { isActive })}
        </div>
        <small>${isActive ? "Active This Turn" : isCharged ? "Charged" : "Charging"}</small>
      </div>
    `;
  }

  return `
    <button
      class="commander-power-button ${isCharged ? "commander-power-button--charged" : ""} ${canActivatePower ? "commander-power-button--ready" : ""} ${isActive ? "commander-power-button--active" : ""}"
      data-action="activate-power"
      ${canActivatePower ? "" : "disabled"}
    >
      <div class="meter commander-meter commander-meter--interactive">
        ${renderCommanderPowerSegments(sideState, powerMax, { isActive })}
      </div>
      <small>${statusLabel}</small>
    </button>
  `;
}

export function renderCommanderPanel(
  commander,
  sideState,
  side,
  { fundsGain = null, canActivatePower = false, isCharged = false, isActive = false, showFunds = true } = {}
) {
  const sideLabel = side === TURN_SIDES.PLAYER ? "Player Commander" : "Enemy Commander";
  const portraitImageUrl = getCommanderPortraitImageUrl(sideState.commanderId);

  return `
    <div class="commander-panel commander-panel--${side}" style="--accent:${commander.accent}">
      <div class="commander-panel__identity">
        ${
          portraitImageUrl
            ? `
              <img
                class="commander-panel__portrait"
                src="${portraitImageUrl}"
                alt="${commander.name} portrait"
                loading="lazy"
                decoding="async"
              />
            `
            : ""
        }
      </div>
      <div class="commander-panel__summary">
        <p class="eyebrow">${sideLabel}</p>
        <h2>${commander.name}</h2>
        <div class="commander-panel__charge-row">
          ${renderCommanderPowerControl(commander, sideState, side, { canActivatePower, isCharged, isActive })}
        </div>
      </div>
    </div>
  `;
}
