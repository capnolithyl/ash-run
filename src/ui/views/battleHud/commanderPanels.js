import { TURN_SIDES } from "../../../game/core/constants.js";
import { getCommanderPortraitImageUrl } from "../../../game/content/commanderArt.js";
import { getCommanderPowerMax } from "../../../game/content/commanders.js";

const COMMANDER_POWER_SEGMENT_VALUE = 25;
const COMMANDER_POWER_SEGMENT_HALF_STEPS = 2;
const COMMANDER_PANEL_ACTIVE_GLOW_CYCLE_MS = 2400;
const COMMANDER_PANEL_ACTIVE_BORDER_CYCLE_MS = 3100;
const COMMANDER_PANEL_ACTIVE_SPINE_CYCLE_MS = 1500;

function getCommanderAnimationClockMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function getCommanderPanelStyle(commanderAccent, { isActive = false, animationClockMs = 0 } = {}) {
  const styleParts = [`--accent:${commanderAccent}`];

  if (isActive) {
    const animationClock = Number.isFinite(animationClockMs) ? animationClockMs : 0;
    styleParts.push(
      `--commander-active-glow-delay:${-Math.floor(animationClock % COMMANDER_PANEL_ACTIVE_GLOW_CYCLE_MS)}ms`,
      `--commander-active-border-delay:${-Math.floor(animationClock % COMMANDER_PANEL_ACTIVE_BORDER_CYCLE_MS)}ms`,
      `--commander-active-spine-delay:${-Math.floor(animationClock % COMMANDER_PANEL_ACTIVE_SPINE_CYCLE_MS)}ms`
    );
  }

  return styleParts.join("; ");
}

function getCommanderTooltipSlot(systemKey) {
  return systemKey === "passive" ? "trait" : "active";
}

function renderCommanderSystem(system, systemKey) {
  const systemLabel = systemKey === "passive" ? "Trait" : "Ability";
  const tooltipSlot = getCommanderTooltipSlot(systemKey);
  const systemVariant = systemKey === "passive" ? "trait" : "ability";

  return `
    <button
      type="button"
      class="commander-panel__system commander-panel__system--${systemVariant}"
      data-tooltip-trigger="${tooltipSlot}"
      aria-label="${systemLabel}: ${system.name}. ${system.summary}"
    >
      <strong>${system.name}</strong>
    </button>
  `;
}

function renderCommanderSystemTooltip(system, systemKey) {
  const systemLabel = systemKey === "passive" ? "Trait" : "Ability";
  const tooltipSlot = getCommanderTooltipSlot(systemKey);

  return `
    <div
      class="commander-panel__tooltip"
      data-tooltip-panel="${tooltipSlot}"
      role="tooltip"
      aria-hidden="true"
    >
      <span class="commander-panel__tooltip-label">${systemLabel}</span>
      <strong class="commander-panel__tooltip-name">${system.name}</strong>
      <p class="commander-panel__tooltip-summary">${system.summary}</p>
    </div>
  `;
}

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
  const activeLabel = isActive
    ? '<span class="commander-meter__active-label" aria-hidden="true">ACTIVE</span>'
    : "";

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
      ${activeLabel}
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

  if (side !== TURN_SIDES.PLAYER) {
    return `
      <div
        class="commander-power-button commander-power-button--readonly ${isCharged ? "commander-power-button--charged" : ""} ${isActive ? "commander-power-button--active" : ""}"
        aria-disabled="true"
      >
        <div class="meter commander-meter commander-meter--interactive">
          ${renderCommanderPowerSegments(sideState, powerMax, { isActive })}
        </div>
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
    </button>
  `;
}

export function renderCommanderPanel(
  commander,
  sideState,
  side,
  {
    fundsGain = null,
    canActivatePower = false,
    isCharged = false,
    isActive = false,
    showFunds = true,
    animationClockMs = 0
  } = {}
) {
  const sideLabel = side === TURN_SIDES.PLAYER ? "Player Commander" : "Enemy Commander";
  const portraitImageUrl = getCommanderPortraitImageUrl(sideState.commanderId);
  const shellClassName = `commander-panel-shell commander-panel-shell--${side} ${
    isActive ? "commander-panel-shell--power-active" : ""
  }`.trim();
  const panelClassName = `commander-panel commander-panel--${side} ${
    isActive ? "commander-panel--power-active" : ""
  }`.trim();
  const resolvedAnimationClockMs = Number.isFinite(animationClockMs)
    ? animationClockMs
    : getCommanderAnimationClockMs();
  const panelStyle = getCommanderPanelStyle(commander.accent, {
    isActive,
    animationClockMs: resolvedAnimationClockMs
  });

  return `
    <div class="${shellClassName}" style="${panelStyle}">
      <div class="${panelClassName}">
        <div class="commander-panel__identity">
          ${
            portraitImageUrl
              ? `
                <div class="commander-panel__portrait-frame">
                  <div class="commander-panel__portrait-mask">
                    <img
                      class="commander-panel__portrait"
                      src="${portraitImageUrl}"
                      alt="${commander.name} portrait"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </div>
              `
              : ""
          }
        </div>
        <div class="commander-panel__summary">
          <p class="eyebrow">${sideLabel}</p>
          <div class="commander-panel__details">
            <div class="commander-panel__nameplate">
              <h2>${commander.name}</h2>
              <span class="commander-panel__title">${commander.title ?? "Commander"}</span>
            </div>
            <div class="commander-panel__systems">
              ${renderCommanderSystem(commander.passive, "passive")}
              ${renderCommanderSystem(commander.active, "active")}
            </div>
            <div class="commander-panel__charge-row">
              ${renderCommanderPowerControl(commander, sideState, side, { canActivatePower, isCharged, isActive })}
            </div>
          </div>
        </div>
      </div>
      ${renderCommanderSystemTooltip(commander.passive, "passive")}
      ${renderCommanderSystemTooltip(commander.active, "active")}
    </div>
  `;
}
