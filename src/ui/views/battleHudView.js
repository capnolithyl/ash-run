import { BATTLE_MODES, TURN_SIDES } from "../../game/core/constants.js";
import { getCommanderById } from "../../game/content/commanders.js";
import {
  canActivatePlayerPower,
  canSelectNextReadyUnit,
  isPlayerPowerCharged,
  renderCommanderPanel
} from "./battleHud/commanderPanels.js";
import {
  renderActionPrompt,
  renderCommandFeed,
  renderExtinguishPrompt,
  renderMedpackPrompt,
  renderRecruitPanel,
  renderSupportPrompt,
  renderTargetingPrompt,
  renderTransportPrompt,
  renderUnloadPrompt
} from "./battleHud/interactionPanels.js";
import {
  renderBattleNotice,
  renderLevelUpOverlay,
  renderOutcomeOverlay,
  renderPauseOverlay,
  renderPowerOverlay,
  renderTurnBanner
} from "./battleHud/overlays.js";
import {
  getFocusTileForSide,
  renderSelectionDetails,
  renderTargetIntelPanel
} from "./battleHud/selectionPanels.js";

function renderBattleMeta(battleSnapshot) {
  const mapName = battleSnapshot.map?.name ?? "Unknown Map";
  const turnLabel = battleSnapshot.turn?.number ?? 1;

  return `
    <div class="battle-footer-meta" aria-label="Battle mission details">
      <span><strong>Mission</strong> Ash Run</span>
      <span><strong>Map</strong> ${mapName}</span>
      <span><strong>Turn</strong> ${turnLabel}</span>
    </div>
  `;
}

export function renderBattleHudView(state, options = {}) {
  const battleSnapshot = state.battleSnapshot;
  const suppressLevelUpOverlay = options.suppressLevelUpOverlay ?? false;
  const suppressOutcomeOverlay = options.suppressOutcomeOverlay ?? false;
  const turnBanner = options.turnBanner ?? null;

  if (!battleSnapshot) {
    return "";
  }

  const playerCommander = getCommanderById(battleSnapshot.player.commanderId);
  const enemyCommander = getCommanderById(battleSnapshot.enemy.commanderId);
  const nextUnitEnabled = canSelectNextReadyUnit(battleSnapshot);
  const playerPowerEnabled = canActivatePlayerPower(battleSnapshot);
  const playerPowerCharged = isPlayerPowerCharged(battleSnapshot);
  const fundsGain = state.battleUi?.fundsGain ?? null;
  const showFunds = battleSnapshot.mode !== BATTLE_MODES.RUN;
  const playerPowerActive = battleSnapshot.player.powerUsedTurn === battleSnapshot.turn.number;
  const enemyPowerActive =
    battleSnapshot.turn.activeSide === TURN_SIDES.ENEMY &&
    battleSnapshot.enemy.powerUsedTurn === battleSnapshot.turn.number;
  const playerFocusTile = getFocusTileForSide(battleSnapshot, state.battleUi, TURN_SIDES.PLAYER);
  const enemyFocusTile = getFocusTileForSide(battleSnapshot, state.battleUi, TURN_SIDES.ENEMY);

  return `
    <div class="battle-shell">
      <input class="battle-drawer-toggle" id="battle-intel-drawer" type="checkbox" aria-hidden="true" />
      <input class="battle-drawer-toggle" id="battle-command-drawer" type="checkbox" aria-hidden="true" />
      <div class="battle-commanders">
        ${renderCommanderPanel(playerCommander, battleSnapshot.player, "player", {
          fundsGain,
          showFunds,
          canActivatePower: playerPowerEnabled,
          isCharged: playerPowerCharged,
          isActive: playerPowerActive
        })}
        ${renderCommanderPanel(enemyCommander, battleSnapshot.enemy, "enemy", {
          fundsGain,
          showFunds,
          isActive: enemyPowerActive
        })}
      </div>
      <div class="battle-footer-actions" aria-label="Battle controls">
        <label
          class="ghost-button ghost-button--small battle-footer-button battle-footer-button--intel battle-drawer-button"
          for="battle-intel-drawer"
        >
          Intel
        </label>
        <button
          class="ghost-button ghost-button--small battle-footer-button battle-footer-button--pause"
          data-action="pause-battle"
        >
          Pause
        </button>
        <button
          class="menu-button menu-button--small battle-footer-button battle-footer-button--next"
          data-action="select-next-unit"
          ${nextUnitEnabled ? "" : "disabled"}
        >
          Next
        </button>
        <button
          class="ghost-button ghost-button--small battle-footer-button battle-footer-button--end-turn"
          data-action="end-turn"
        >
          End Turn
        </button>
        <label
          class="ghost-button ghost-button--small battle-footer-button battle-footer-button--feed battle-drawer-button"
          for="battle-command-drawer"
        >
          Feed
        </label>
      </div>
      ${renderBattleMeta(battleSnapshot)}
      <aside class="battle-rail battle-rail--left">
        <div class="battle-drawer-header">
          <span>Selected Unit</span>
          <label class="ghost-button ghost-button--small" for="battle-intel-drawer">Close</label>
        </div>
        ${renderSelectionDetails(playerFocusTile, {
          title: "Selected Unit",
          emptyTitle: "Selected Unit",
          emptyBody: "Select a friendly unit, building, or tile to inspect it here."
        })}
        ${renderRecruitPanel(battleSnapshot)}
      </aside>
      <aside class="battle-rail battle-rail--right">
        <div class="battle-drawer-header">
          <span>Target Intel</span>
          <label class="ghost-button ghost-button--small" for="battle-command-drawer">Close</label>
        </div>
        ${renderTargetIntelPanel(battleSnapshot, state.battleUi?.hoveredTile, enemyFocusTile)}
        ${renderCommandFeed(battleSnapshot.log, state.battleUi?.hoveredTile)}
      </aside>
      ${renderActionPrompt(battleSnapshot)}
      ${renderTargetingPrompt(battleSnapshot)}
      ${renderUnloadPrompt(battleSnapshot)}
      ${renderTransportPrompt(battleSnapshot)}
      ${renderSupportPrompt(battleSnapshot)}
      ${renderMedpackPrompt(battleSnapshot)}
      ${renderExtinguishPrompt(battleSnapshot)}
      ${renderBattleNotice(state.battleUi?.notice)}
      ${renderTurnBanner(turnBanner)}
      ${renderPowerOverlay(state.battleUi?.powerOverlay)}
      ${suppressLevelUpOverlay ? "" : renderLevelUpOverlay(battleSnapshot)}
      ${renderPauseOverlay(state, battleSnapshot)}
      ${suppressOutcomeOverlay ? "" : renderOutcomeOverlay(state, battleSnapshot)}
    </div>
  `;
}
