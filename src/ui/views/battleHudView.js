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
import { renderCombatCutsceneOverlay } from "./battleHud/combatCutsceneOverlay.js";
import {
  getFocusTileForSide,
  renderSelectionDetails,
  renderTargetIntelPanel
} from "./battleHud/selectionPanels.js";

function renderBattleMeta(battleSnapshot) {
  const mapName = battleSnapshot.map?.name ?? "Unknown Map";
  const turnLabel = battleSnapshot.turn?.number ?? 1;
  const mission = battleSnapshot.presentation?.mission ?? null;

  return `
    <div class="battle-footer-meta" aria-label="Battle mission details">
      <span class="battle-footer-meta__item">
        <strong>Mission</strong>
        <em>${mission?.label ?? "Rout"}</em>
        ${mission?.status ? `<small>${mission.status}</small>` : ""}
      </span>
      <span class="battle-footer-meta__item">
        <strong>Map</strong>
        <em>${mapName}</em>
      </span>
      <span class="battle-footer-meta__item">
        <strong>Turn</strong>
        <em>${turnLabel}</em>
      </span>
    </div>
  `;
}

function renderBattleFooterImageButton({
  action,
  className,
  label,
  imageSlug,
  disabled = false
}) {
  const imageUrl = `./assets/img/ui/buttons/${imageSlug}.png`;

  return `
    <button
      class="menu-button battle-footer-button ${className} title-button--has-image"
      data-action="${action}"
      aria-label="${label}"
      ${disabled ? "disabled" : ""}
    >
      <img
        class="title-button__image"
        src="${imageUrl}"
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        onload="this.closest('button')?.classList.add('title-button--image-loaded')"
        onerror="this.remove()"
      />
    </button>
  `;
}

function renderCompactIntelSheet(playerFocusTile, battleSnapshot, hoveredTile, enemyFocusTile) {
  return `
    <input
      class="battle-intel-tab-toggle"
      id="battle-intel-tab-selected"
      name="battle-intel-tab"
      type="radio"
      value="selected"
      checked
      aria-hidden="true"
    />
    <input
      class="battle-intel-tab-toggle"
      id="battle-intel-tab-target"
      name="battle-intel-tab"
      type="radio"
      value="target"
      aria-hidden="true"
    />
    <input
      class="battle-intel-tab-toggle"
      id="battle-intel-tab-feed"
      name="battle-intel-tab"
      type="radio"
      value="feed"
      aria-hidden="true"
    />
    <aside class="battle-compact-sheet" aria-label="Battle Intel">
      <div class="battle-drawer-header battle-drawer-header--compact">
        <span>Intel</span>
        <label class="ghost-button ghost-button--small" for="battle-intel-drawer">Close</label>
      </div>
      <div class="battle-compact-sheet__tabs" role="tablist" aria-label="Battle Intel Tabs">
        <label class="battle-compact-sheet__tab" for="battle-intel-tab-selected">Selected Unit</label>
        <label class="battle-compact-sheet__tab" for="battle-intel-tab-target">Target Intel</label>
        <label class="battle-compact-sheet__tab" for="battle-intel-tab-feed">Command Feed</label>
      </div>
      <div class="battle-compact-sheet__panels">
        <section class="battle-compact-sheet__panel battle-compact-sheet__panel--selected">
          ${renderSelectionDetails(playerFocusTile, {
            title: "Selected Unit",
            emptyTitle: "Selected Unit",
            emptyBody: "Select a friendly unit, building, or tile to inspect it here."
          })}
          ${renderRecruitPanel(battleSnapshot)}
        </section>
        <section class="battle-compact-sheet__panel battle-compact-sheet__panel--target">
          ${renderTargetIntelPanel(battleSnapshot, hoveredTile, enemyFocusTile)}
        </section>
        <section class="battle-compact-sheet__panel battle-compact-sheet__panel--feed">
          ${renderCommandFeed(battleSnapshot.log, hoveredTile)}
        </section>
      </div>
    </aside>
  `;
}

function renderDesktopBattlePanels(battleSnapshot, hoveredTile, playerFocusTile, enemyFocusTile) {
  return `
    <div class="battle-desktop-layout">
      <aside class="battle-side-panel battle-side-panel--selected" aria-label="Selected Unit Intel">
        ${renderSelectionDetails(playerFocusTile, {
          title: "Selected Unit",
          emptyTitle: "Selected Unit",
          emptyBody: "Select a friendly unit, building, or tile to inspect it here."
        })}
        ${renderRecruitPanel(battleSnapshot)}
      </aside>
      <div class="battle-side-stack battle-side-stack--right" aria-label="Target Intel and Command Feed">
        <aside class="battle-side-panel battle-side-panel--target" aria-label="Target Intel">
          ${renderTargetIntelPanel(battleSnapshot, hoveredTile, enemyFocusTile)}
        </aside>
        <aside class="battle-side-panel battle-side-panel--feed" aria-label="Command Feed">
          ${renderCommandFeed(battleSnapshot.log, hoveredTile)}
        </aside>
      </div>
    </div>
  `;
}

function isCommanderPowerActiveForSide(battleSnapshot, side) {
  const turnNumber = Number(battleSnapshot?.turn?.number);
  const activeSide = battleSnapshot?.turn?.activeSide;
  const powerUsedTurn = Number(battleSnapshot?.[side]?.powerUsedTurn);

  if (!Number.isFinite(turnNumber) || !Number.isFinite(powerUsedTurn) || !activeSide) {
    return false;
  }

  if (activeSide === side) {
    return powerUsedTurn === turnNumber;
  }

  if (side === TURN_SIDES.PLAYER && activeSide === TURN_SIDES.ENEMY) {
    return powerUsedTurn === turnNumber - 1;
  }

  if (side === TURN_SIDES.ENEMY && activeSide === TURN_SIDES.PLAYER) {
    return powerUsedTurn === turnNumber;
  }

  return false;
}

export function renderBattleHudView(state, options = {}) {
  const battleSnapshot = state.battleSnapshot;
  const suppressLevelUpOverlay = options.suppressLevelUpOverlay ?? false;
  const suppressOutcomeOverlay = options.suppressOutcomeOverlay ?? false;
  const turnBanner = options.turnBanner ?? null;
  const combatCutscene = state.battleUi?.combatCutscene ?? null;
  const combatCutsceneActive = Boolean(combatCutscene);

  if (!battleSnapshot) {
    return "";
  }

  const playerCommander = getCommanderById(battleSnapshot.player.commanderId);
  const enemyCommander = getCommanderById(battleSnapshot.enemy.commanderId);
  const nextUnitEnabled = canSelectNextReadyUnit(battleSnapshot);
  const playerPowerEnabled = canActivatePlayerPower(battleSnapshot);
  const playerPowerCharged = isPlayerPowerCharged(battleSnapshot);
  const fundsGain = state.battleUi?.fundsGain ?? null;
  const hoveredTile = state.battleUi?.hoveredTile ?? null;
  const showFunds = battleSnapshot.mode !== BATTLE_MODES.RUN;
  const playerPowerActive = isCommanderPowerActiveForSide(battleSnapshot, TURN_SIDES.PLAYER);
  const enemyPowerActive = isCommanderPowerActiveForSide(battleSnapshot, TURN_SIDES.ENEMY);
  const commanderAnimationClockMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
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
          isActive: playerPowerActive,
          animationClockMs: commanderAnimationClockMs
        })}
        ${renderCommanderPanel(enemyCommander, battleSnapshot.enemy, "enemy", {
          fundsGain,
          showFunds,
          isActive: enemyPowerActive,
          animationClockMs: commanderAnimationClockMs
        })}
      </div>
      <div class="battle-footer-actions" aria-label="Battle controls">
        <label
          class="ghost-button ghost-button--small battle-footer-button battle-footer-button--intel battle-drawer-button"
          for="battle-intel-drawer"
        >
          Intel
        </label>
        ${renderBattleFooterImageButton({
          action: "pause-battle",
          className: "battle-footer-button--pause",
          label: "Pause",
          imageSlug: "pause"
        })}
        ${renderBattleFooterImageButton({
          action: "select-next-unit",
          className: "battle-footer-button--next",
          label: "Next",
          imageSlug: "next",
          disabled: !nextUnitEnabled
        })}
        ${renderBattleFooterImageButton({
          action: "end-turn",
          className: "battle-footer-button--end-turn",
          label: "End Turn",
          imageSlug: "end-turn"
        })}
        <label
          class="ghost-button ghost-button--small battle-footer-button battle-footer-button--feed battle-drawer-button"
          for="battle-command-drawer"
        >
          Feed
        </label>
      </div>
      ${renderBattleMeta(battleSnapshot)}
      ${renderDesktopBattlePanels(battleSnapshot, hoveredTile, playerFocusTile, enemyFocusTile)}
      ${renderCompactIntelSheet(
        playerFocusTile,
        battleSnapshot,
        hoveredTile,
        enemyFocusTile
      )}
      ${renderActionPrompt(battleSnapshot)}
      ${renderTargetingPrompt(battleSnapshot)}
      ${renderUnloadPrompt(battleSnapshot)}
      ${renderTransportPrompt(battleSnapshot)}
      ${renderSupportPrompt(battleSnapshot)}
      ${renderMedpackPrompt(battleSnapshot)}
      ${renderExtinguishPrompt(battleSnapshot)}
      ${combatCutsceneActive ? "" : renderBattleNotice(state.battleUi?.notice)}
      ${combatCutsceneActive ? "" : renderTurnBanner(turnBanner)}
      ${combatCutsceneActive ? "" : renderPowerOverlay(state.battleUi?.powerOverlay)}
      ${renderCombatCutsceneOverlay(combatCutscene, state.metaState?.options)}
      ${suppressLevelUpOverlay || combatCutsceneActive ? "" : renderLevelUpOverlay(battleSnapshot)}
      ${combatCutsceneActive ? "" : renderPauseOverlay(state, battleSnapshot)}
      ${suppressOutcomeOverlay || combatCutsceneActive ? "" : renderOutcomeOverlay(state, battleSnapshot)}
    </div>
  `;
}
