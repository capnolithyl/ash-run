import { COMMANDER_POWER_MAX } from "../../game/core/constants.js";
import { getCommanderById } from "../../game/content/commanders.js";
import { renderOptionFields } from "./optionFieldsView.js";

function formatCostLabel(cost) {
  return cost >= 99 ? "Blocked" : `${cost}`;
}

function renderExperienceBar(unit) {
  return `
    <div class="selection-section selection-section--xp">
      <div class="selection-header">
        <strong>Experience</strong>
        <span>${unit.experience}/${unit.experienceToNextLevel}</span>
      </div>
      <div class="meter meter--exp">
        <div class="meter__bar">
          <div style="width:${Math.max(6, unit.experienceRatio * 100)}%"></div>
        </div>
      </div>
    </div>
  `;
}

function renderFundsPanel(label, value, modifierClass = "") {
  return `
    <div class="funds-panel ${modifierClass}">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function canSelectNextReadyUnit(battleSnapshot) {
  if (
    !battleSnapshot ||
    battleSnapshot.victory ||
    battleSnapshot.turn.activeSide !== "player" ||
    battleSnapshot.presentation?.pendingAction
  ) {
    return false;
  }

  return battleSnapshot.player.units.some((unit) => !unit.hasMoved && unit.current.hp > 0);
}

function getBattleLayout(battleSnapshot) {
  if (typeof window === "undefined") {
    return null;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxBoardWidth = viewportWidth * 0.56;
  const maxBoardHeight = viewportHeight * 0.72;
  const cellSize = Math.floor(
    Math.min(maxBoardWidth / battleSnapshot.map.width, maxBoardHeight / battleSnapshot.map.height)
  );
  const boardWidth = battleSnapshot.map.width * cellSize;
  const boardHeight = battleSnapshot.map.height * cellSize;

  return {
    cellSize,
    originX: Math.round((viewportWidth - boardWidth) / 2),
    originY: Math.round((viewportHeight - boardHeight) / 2)
  };
}

function getActionPromptStyle(battleSnapshot, pendingAction) {
  const layout = getBattleLayout(battleSnapshot);

  if (!layout) {
    return "";
  }

  const menuWidth = 188;
  const tileLeft = layout.originX + pendingAction.toX * layout.cellSize;
  const tileTop = layout.originY + pendingAction.toY * layout.cellSize;
  const rightSideLeft = tileLeft + layout.cellSize + 12;
  const leftSideLeft = tileLeft - menuWidth - 12;
  const safeLeft =
    rightSideLeft + menuWidth < window.innerWidth - 18
      ? rightSideLeft
      : Math.max(18, leftSideLeft);
  const safeTop = Math.max(92, Math.min(window.innerHeight - 180, tileTop - 8));

  return `left:${safeLeft}px;top:${safeTop}px;`;
}

function renderSelectionDetails(battleSnapshot) {
  const selectedTile = battleSnapshot.presentation?.selectedTile;

  if (!selectedTile) {
    return `
      <div class="card-block">
        <h3>Selection</h3>
        <p>Select a unit or production building on the battlefield.</p>
        <p>Empty tiles can also be clicked to inspect terrain and movement costs.</p>
      </div>
    `;
  }

  const unit = selectedTile.unit;
  const building = selectedTile.building;

  return `
    <div class="card-block">
      <div class="selection-header">
        <h3>Selection</h3>
        <span class="selection-chip">Tile ${selectedTile.x + 1},${selectedTile.y + 1}</span>
      </div>
      ${
        unit
          ? `
            <div class="selection-section">
              <div class="selection-header">
                <strong>${unit.name}</strong>
                <span class="selection-chip selection-chip--${unit.owner}">${unit.ownerLabel}</span>
              </div>
              <p>Level ${unit.level} | HP ${unit.hp}/${unit.maxHealth}</p>
              <p>ATK ${unit.attack} | ARM ${unit.armor} | MOV ${unit.movement}</p>
              <p>RNG ${unit.minRange}-${unit.maxRange} | Ammo ${unit.ammo}/${unit.ammoMax}</p>
            </div>
            ${renderExperienceBar(unit)}
          `
          : ""
      }
      ${
        building
          ? `
            <div class="selection-section">
              <div class="selection-header">
                <strong>${building.name}</strong>
                <span class="selection-chip selection-chip--${building.owner}">${building.ownerLabel}</span>
              </div>
              <p>${building.summary}</p>
              ${
                building.canRecruit
                  ? `<p>Function: Produces ${building.recruitmentFamilies.length} unit types.</p>`
                  : ""
              }
              ${building.income > 0 ? `<p>Income: +${building.income} funds each turn.</p>` : ""}
            </div>
          `
          : ""
      }
      <div class="selection-section selection-section--terrain">
        <strong>${selectedTile.terrain.label}</strong>
        <p>Infantry cost ${formatCostLabel(selectedTile.terrain.moveCost)} | Vehicles cost ${formatCostLabel(selectedTile.terrain.vehicleMoveCost)}</p>
        <p>${selectedTile.terrain.blocksGround ? "Ground units cannot cross this tile." : "Ground units can traverse this tile."}</p>
      </div>
    </div>
  `;
}

function renderActionPrompt(battleSnapshot) {
  const pendingAction = battleSnapshot.presentation?.pendingAction;

  if (!pendingAction || pendingAction.isTargeting) {
    return "";
  }

  return `
    <div class="battle-command-prompt" style="${getActionPromptStyle(battleSnapshot, pendingAction)}">
      <div class="battle-command-prompt__card">
        <div class="battle-command-prompt__header">
          <p class="eyebrow">Unit Orders</p>
          <strong>${pendingAction.unitName}</strong>
        </div>
        <div class="battle-command-prompt__menu">
          ${
            pendingAction.canFire
              ? '<button class="battle-command-prompt__action battle-command-prompt__action--primary" data-action="begin-attack">Fire</button>'
              : ""
          }
          ${
            pendingAction.canCapture
              ? '<button class="battle-command-prompt__action battle-command-prompt__action--capture" data-action="capture-building">Capture</button>'
              : ""
          }
          <button class="battle-command-prompt__action" data-action="wait-unit">Wait</button>
          <button class="battle-command-prompt__action battle-command-prompt__action--subtle" data-action="redo-move">Redo</button>
        </div>
      </div>
    </div>
  `;
}

function renderTargetingPrompt(battleSnapshot) {
  const pendingAction = battleSnapshot.presentation?.pendingAction;

  if (!pendingAction?.isTargeting) {
    return "";
  }

  return `
    <div class="battle-targeting-hint">
      <div class="battle-targeting-hint__copy">
        <p class="eyebrow">Attack Mode</p>
        <strong>${pendingAction.unitName} ready to fire</strong>
        <span>Select a highlighted enemy or cancel.</span>
      </div>
      <button class="ghost-button ghost-button--small battle-targeting-hint__cancel" data-action="cancel-attack">Cancel</button>
    </div>
  `;
}

function renderLevelUpOverlay(battleSnapshot) {
  const levelUpEvent = battleSnapshot.levelUpQueue?.[0];

  if (!levelUpEvent) {
    return "";
  }

  return `
    <div class="battle-overlay battle-overlay--level-up">
      <div class="overlay-card overlay-card--level-up">
        <p class="eyebrow">Level Up</p>
        <h2>${levelUpEvent.unitName}</h2>
        <p>Level ${levelUpEvent.previousLevel} to ${levelUpEvent.newLevel}</p>
        <div class="level-up-stats">
          ${levelUpEvent.statGains
            .map(
              (gain, index) => `
                <div class="level-up-stat" style="animation-delay:${index * 120}ms">
                  <span>${gain.label}</span>
                  <strong>+${gain.delta}</strong>
                  <small>${gain.previousValue} -> ${gain.nextValue}</small>
                </div>
              `
            )
            .join("")}
        </div>
        <button class="menu-button" data-action="acknowledge-level-up">Continue</button>
      </div>
    </div>
  `;
}

function renderTurnBanner(turnBanner) {
  if (!turnBanner) {
    return "";
  }

  return `
    <div class="turn-banner turn-banner--${turnBanner.side}">
      <div class="turn-banner__card">
        <p class="eyebrow">Turn ${turnBanner.number}</p>
        <h2>${turnBanner.side === "player" ? "Player Turn" : "Enemy Turn"}</h2>
      </div>
    </div>
  `;
}

function renderRecruitPanel(battleSnapshot) {
  const options = battleSnapshot.presentation?.recruitOptions ?? [];

  if (options.length === 0) {
    return "";
  }

  return `
    <div class="card-block">
      <h3>Recruitment</h3>
      <div class="recruit-list">
        ${options
          .map(
            (unit) => `
              <button class="recruit-card" data-action="recruit-unit" data-unit-type-id="${unit.id}">
                <strong>${unit.name}</strong>
                <span>${unit.adjustedCost} credits</span>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderPauseOverlay(state) {
  if (!state.battleUi.pauseMenuOpen) {
    return "";
  }

  const confirmingExit = state.battleUi.confirmAbandon;

  return `
    <div class="battle-overlay battle-overlay--pause">
      <div class="overlay-card overlay-card--pause">
        <p class="eyebrow">Paused</p>
        <h2>Battle Intermission</h2>
        ${
          confirmingExit
            ? `
              <div class="pause-warning">
                <p>Return to the main menu and abandon this run?</p>
                <p>The active save slot will be cleared so this battle will not be available to continue.</p>
              </div>
              <div class="battle-actions">
                <button class="menu-button menu-button--danger" data-action="confirm-abandon-run">Return To Main Menu</button>
                <button class="ghost-button" data-action="cancel-abandon-run">Keep Playing</button>
              </div>
            `
            : `
              <div class="options-list options-list--compact">
                ${renderOptionFields(state.metaState.options)}
              </div>
              <div class="battle-actions">
                <button class="menu-button" data-action="resume-battle">Continue Battle</button>
                <button class="ghost-button" data-action="prompt-abandon-run">Back To Main Menu</button>
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderOutcomeOverlay(state, battleSnapshot) {
  if (!battleSnapshot?.victory) {
    return "";
  }

  if (battleSnapshot.victory.winner === "player" && state.runStatus === "complete") {
    return `
      <div class="battle-overlay">
        <div class="overlay-card">
          <p class="eyebrow">Run Complete</p>
          <h2>Route Secured</h2>
          <p>${state.banner || "You cleared the current prototype goal."}</p>
          <button class="menu-button" data-action="back-to-title">Return To Title</button>
        </div>
      </div>
    `;
  }

  if (battleSnapshot.victory.winner === "player") {
    return `
      <div class="battle-overlay">
        <div class="overlay-card">
          <p class="eyebrow">Battle Won</p>
          <h2>${battleSnapshot.victory.message}</h2>
          <p>Surviving units will carry into the next map fully restored for the prototype.</p>
          <button class="menu-button" data-action="advance-run">Deploy Next Map</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="battle-overlay">
      <div class="overlay-card">
        <p class="eyebrow">Run Lost</p>
        <h2>${battleSnapshot.victory.message}</h2>
        <p>The current save slot will be cleared when you return to the title screen.</p>
        <button class="menu-button menu-button--danger" data-action="back-to-title">Return To Title</button>
      </div>
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
  return `
    <div class="battle-shell">
      <aside class="battle-rail">
        <div class="commander-panel" style="--accent:${playerCommander.accent}">
          <p class="eyebrow">Player Commander</p>
          <h2>${playerCommander.name}</h2>
          <p>${playerCommander.passive.summary}</p>
          <div class="meter">
            <span>Power ${Math.floor(battleSnapshot.player.charge)}/${COMMANDER_POWER_MAX}</span>
            <div class="meter__bar">
              <div style="width:${(battleSnapshot.player.charge / COMMANDER_POWER_MAX) * 100}%"></div>
            </div>
          </div>
          <p class="commander-funds">Funds ${battleSnapshot.player.funds}</p>
        </div>
        ${renderSelectionDetails(battleSnapshot)}
        ${renderRecruitPanel(battleSnapshot)}
      </aside>
      <div class="battle-topbar">
        <div>
          <p class="eyebrow">${battleSnapshot.map.name}</p>
          <h2>Map ${state.runState.mapIndex + 1}/${state.runState.targetMapCount}</h2>
        </div>
        <div class="battle-topbar__funds">
          ${renderFundsPanel("Player Funds", battleSnapshot.player.funds, "funds-panel--player")}
          ${renderFundsPanel("Enemy Funds", battleSnapshot.enemy.funds, "funds-panel--enemy")}
        </div>
        <div class="battle-topbar__meta">
          <span>Turn ${battleSnapshot.turn.number}</span>
          <span>${battleSnapshot.turn.activeSide === "player" ? "Player Phase" : "Enemy Phase"}</span>
        </div>
      </div>
      <aside class="battle-rail battle-rail--right">
        <div class="commander-panel commander-panel--enemy" style="--accent:${enemyCommander.accent}">
          <p class="eyebrow">Enemy Commander</p>
          <h2>${enemyCommander.name}</h2>
          <p>${enemyCommander.passive.summary}</p>
          <div class="meter">
            <span>Power ${Math.floor(battleSnapshot.enemy.charge)}/${COMMANDER_POWER_MAX}</span>
            <div class="meter__bar">
              <div style="width:${(battleSnapshot.enemy.charge / COMMANDER_POWER_MAX) * 100}%"></div>
            </div>
          </div>
          <p class="commander-funds">Funds ${battleSnapshot.enemy.funds}</p>
        </div>
        <div class="card-block">
          <h3>Command Feed</h3>
          <div class="log-feed">
            ${battleSnapshot.log.map((line) => `<p>${line}</p>`).join("")}
          </div>
        </div>
        <div class="battle-actions">
          <button class="ghost-button ghost-button--small" data-action="pause-battle">Pause</button>
          <button
            class="ghost-button ghost-button--small"
            data-action="select-next-unit"
            ${nextUnitEnabled ? "" : "disabled"}
          >
            Next Unit
          </button>
          <button class="menu-button menu-button--small" data-action="activate-power">Use Commander Power</button>
          <button class="ghost-button ghost-button--small" data-action="end-turn">End Turn</button>
        </div>
      </aside>
      ${renderActionPrompt(battleSnapshot)}
      ${renderTargetingPrompt(battleSnapshot)}
      ${renderTurnBanner(turnBanner)}
      ${suppressLevelUpOverlay ? "" : renderLevelUpOverlay(battleSnapshot)}
      ${renderPauseOverlay(state)}
      ${suppressOutcomeOverlay ? "" : renderOutcomeOverlay(state, battleSnapshot)}
    </div>
  `;
}
