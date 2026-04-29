import { TURN_SIDES } from "../../../game/core/constants.js";
import { getCommanderPortraitImageUrl } from "../../../game/content/commanderArt.js";
import { getCommanderPowerMax } from "../../../game/content/commanders.js";

function renderFundsPanel(label, value, side, modifierClass = "", fundsGain = null) {
  const isGaining = fundsGain?.side === side;
  const displayValue = isGaining ? fundsGain.from : value;

  return `
    <div class="funds-panel ${modifierClass} ${isGaining ? "funds-panel--gaining" : ""}" data-funds-panel="${side}">
      <span>${label}</span>
      <strong data-funds-value="${side}">${displayValue}</strong>
      ${
        isGaining && !fundsGain.pending
          ? `<em class="funds-panel__gain">+${fundsGain.amount}</em>`
          : ""
      }
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
      battleSnapshot.player.charge >= getCommanderPowerMax(battleSnapshot.player.commanderId)
  );
}

export function isPlayerPowerCharged(battleSnapshot) {
  if (!battleSnapshot) {
    return false;
  }

  return battleSnapshot.player.charge >= getCommanderPowerMax(battleSnapshot.player.commanderId);
}

function renderCommanderPowerControl(
  commander,
  sideState,
  side,
  { canActivatePower = false, isCharged = false } = {}
) {
  const powerMax = getCommanderPowerMax(sideState.commanderId);
  const powerRatio = Math.min(1, sideState.charge / powerMax);

  if (side !== TURN_SIDES.PLAYER) {
    return `
      <div class="meter commander-meter">
        <span>Power: ${commander.active.name ?? "Power"} | ${Math.floor(sideState.charge)}/${powerMax}</span>
        <div class="meter__bar">
          <div style="width:${powerRatio * 100}%"></div>
        </div>
      </div>
    `;
  }

  return `
    <button
      class="commander-power-button ${isCharged ? "commander-power-button--charged" : ""} ${canActivatePower ? "commander-power-button--ready" : ""}"
      data-action="activate-power"
      ${canActivatePower ? "" : "disabled"}
    >
      <div class="commander-power-button__header">
        <span>Power: ${commander.active.name ?? "Power"}</span>
        <strong>${Math.floor(sideState.charge)}/${powerMax}</strong>
      </div>
      <div class="meter commander-meter commander-meter--interactive">
        <div class="meter__bar">
          <div style="width:${powerRatio * 100}%"></div>
        </div>
      </div>
      <small>${canActivatePower ? "Activate Power" : isCharged ? "Ready Next Turn" : "Charging"}</small>
    </button>
  `;
}

export function renderCommanderPanel(
  commander,
  sideState,
  side,
  { fundsGain = null, canActivatePower = false, isCharged = false, showFunds = true } = {}
) {
  const sideLabel = side === TURN_SIDES.PLAYER ? "Player Commander" : "Enemy Commander";
  const portraitImageUrl = getCommanderPortraitImageUrl(sideState.commanderId);

  return `
    <div class="commander-panel commander-panel--${side}" style="--accent:${commander.accent}">
      <div class="commander-panel__header">
        <div class="commander-panel__summary">
          <p class="eyebrow">${sideLabel}</p>
          <h2>${commander.name}</h2>
          ${
            showFunds
              ? renderFundsPanel(
                  "Funds",
                  sideState.funds,
                  side,
                  `funds-panel--${side} funds-panel--commander`,
                  fundsGain
                )
              : ""
          }
        </div>
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
      </div>
      <div class="commander-ability">
        <span>Passive: ${commander.passive.name ?? "Passive"}</span>
        <p>${commander.passive.summary}</p>
      </div>
      <div class="commander-ability commander-ability--active">
        <span>Power: ${commander.active.name ?? "Power"}</span>
        <p>${commander.active.summary}</p>
      </div>
      ${renderCommanderPowerControl(commander, sideState, side, { canActivatePower, isCharged })}
    </div>
  `;
}
