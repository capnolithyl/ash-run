import { COMMANDER_POWER_MAX } from "../../game/core/constants.js";
import { getCommanderById } from "../../game/content/commanders.js";
import { UNIT_CATALOG } from "../../game/content/unitCatalog.js";
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
        <p>Armor bonus: +${selectedTile.terrain.armorBonus ?? 0}</p>
        <p>${
          selectedTile.terrain.blocksGround
            ? "Ground units cannot cross this tile."
            : selectedTile.terrain.blockedFamilies?.length
              ? `${selectedTile.terrain.blockedFamilies.join(", ")} units cannot cross this tile.`
              : "Ground units can traverse this tile."
        }</p>
      </div>
    </div>
  `;
}

function getHoveredTargetReference(battleSnapshot, hoveredTile) {
  const pendingAction = battleSnapshot.presentation?.pendingAction;

  if (!pendingAction?.isTargeting || !hoveredTile) {
    return null;
  }

  const target = battleSnapshot.enemy.units.find(
    (unit) => unit.current.hp > 0 && unit.x === hoveredTile.x && unit.y === hoveredTile.y
  );

  if (!target) {
    return null;
  }

  const forecast = battleSnapshot.presentation?.attackForecasts?.[target.id] ?? null;

  if (!forecast) {
    return null;
  }

  return {
    target,
    forecast
  };
}

function renderTargetReference(battleSnapshot, hoveredTile) {
  const targetReference = getHoveredTargetReference(battleSnapshot, hoveredTile);

  if (!targetReference) {
    return "";
  }

  const { target, forecast } = targetReference;
  const counterLabel = forecast.received
    ? `${forecast.received.min}-${forecast.received.max}`
    : "0";

  return `
    <div class="card-block card-block--target-reference">
      <div class="selection-header">
        <h3>Target</h3>
        <span class="selection-chip selection-chip--enemy">Enemy</span>
      </div>
      <div class="selection-section">
        <div class="selection-header">
          <strong>${target.name}</strong>
          <span class="selection-chip">Lv ${target.level}</span>
        </div>
        <p>HP ${target.current.hp}/${target.stats.maxHealth} | XP ${target.experience}</p>
        <p>ATK ${target.stats.attack} | ARM ${target.stats.armor} | MOV ${target.stats.movement}</p>
        <p>RNG ${target.stats.minRange}-${target.stats.maxRange} | Ammo ${target.current.ammo}/${target.stats.ammoMax}</p>
      </div>
      <div class="selection-section">
        <strong>Forecast</strong>
        <p>Damage ${forecast.dealt.min}-${forecast.dealt.max} | Counter ${counterLabel}</p>
      </div>
    </div>
  `;
}

function renderActionPrompt(battleSnapshot) {
  const pendingAction = battleSnapshot.presentation?.pendingAction;

  if (
    !pendingAction ||
    pendingAction.isTargeting ||
    pendingAction.isChoosingTransport ||
    pendingAction.isChoosingSupport
  ) {
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
          ${
            pendingAction.canSupport
              ? '<button class="battle-command-prompt__action" data-action="use-support">Support</button>'
              : ""
          }
          ${
            pendingAction.canEnterTransport
              ? '<button class="battle-command-prompt__action" data-action="enter-transport">Enter</button>'
              : ""
          }
          ${
            pendingAction.canUnloadTransport
              ? '<button class="battle-command-prompt__action" data-action="begin-unload">Unload</button>'
              : ""
          }
          <button class="battle-command-prompt__action" data-action="wait-unit">Wait</button>
          <button class="battle-command-prompt__action battle-command-prompt__action--subtle" data-action="redo-move">Redo</button>
        </div>
      </div>
    </div>
  `;
}

function renderSupportPrompt(battleSnapshot) {
  const pendingAction = battleSnapshot.presentation?.pendingAction;

  if (!pendingAction?.isChoosingSupport) {
    return "";
  }

  return `
    <div class="battle-targeting-hint">
      <div class="battle-targeting-hint__copy">
        <p class="eyebrow">Support Mode</p>
        <strong>${pendingAction.unitName} ready to support</strong>
        <span>Select a highlighted ally or cancel.</span>
      </div>
      <button class="ghost-button ghost-button--small battle-targeting-hint__cancel" data-action="cancel-support-choice">Cancel</button>
    </div>
  `;
}

function renderTransportPrompt(battleSnapshot) {
  const pendingAction = battleSnapshot.presentation?.pendingAction;

  if (!pendingAction?.isChoosingTransport) {
    return "";
  }

  return `
    <div class="battle-targeting-hint">
      <div class="battle-targeting-hint__copy">
        <p class="eyebrow">Transport Mode</p>
        <strong>${pendingAction.unitName} ready to board</strong>
        <span>Select a highlighted runner or cancel.</span>
      </div>
      <button class="ghost-button ghost-button--small battle-targeting-hint__cancel" data-action="cancel-transport-choice">Cancel</button>
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

function renderDebugControls(state, battleSnapshot) {
  if (!state.debugMode) {
    return "";
  }

  const selectedTile = battleSnapshot.presentation?.selectedTile;
  const selectedUnit = selectedTile?.unit;
  const unitOptions = Object.values(UNIT_CATALOG)
    .map((unit) => `<option value="${unit.id}">${unit.name}</option>`)
    .join("");
  const spawnX = selectedTile?.x ?? 0;
  const spawnY = selectedTile?.y ?? 0;

  return `
    <div class="debug-panel">
      <h3>Debug Toolkit</h3>
      <p class="debug-panel__hint">Spawn units anywhere, override stats, and recharge powers instantly.</p>
      <div class="debug-grid">
        <label>Side
          <select data-debug-field="spawn-owner">
            <option value="player">Player</option>
            <option value="enemy">Enemy</option>
          </select>
        </label>
        <label>Unit
          <select data-debug-field="spawn-unit-type">${unitOptions}</select>
        </label>
        <label>X
          <input data-debug-field="spawn-x" type="number" value="${spawnX}" min="0" max="${battleSnapshot.map.width - 1}" />
        </label>
        <label>Y
          <input data-debug-field="spawn-y" type="number" value="${spawnY}" min="0" max="${battleSnapshot.map.height - 1}" />
        </label>
        <label>ATK <input data-debug-field="spawn-attack" type="number" placeholder="default" /></label>
        <label>ARM <input data-debug-field="spawn-armor" type="number" placeholder="default" /></label>
        <label>Max HP <input data-debug-field="spawn-max-health" type="number" placeholder="default" /></label>
        <label>MOV <input data-debug-field="spawn-movement" type="number" placeholder="default" /></label>
        <label>Min RNG <input data-debug-field="spawn-min-range" type="number" placeholder="default" /></label>
        <label>Max RNG <input data-debug-field="spawn-max-range" type="number" placeholder="default" /></label>
        <label>Max STA <input data-debug-field="spawn-max-stamina" type="number" placeholder="default" /></label>
        <label>Max Ammo <input data-debug-field="spawn-max-ammo" type="number" placeholder="default" /></label>
        <label>Luck <input data-debug-field="spawn-luck" type="number" placeholder="default" /></label>
      </div>
      <div class="battle-actions">
        <button class="menu-button menu-button--small" data-action="debug-spawn-unit">Spawn Unit</button>
        <button class="ghost-button ghost-button--small" data-action="debug-full-charge-player">Player Full Charge</button>
        <button class="ghost-button ghost-button--small" data-action="debug-full-charge-enemy">Enemy Full Charge</button>
        <button class="ghost-button ghost-button--small" data-action="debug-refresh-player-actions">Refresh Player Actions</button>
        <button class="ghost-button ghost-button--small" data-action="debug-refresh-enemy-actions">Refresh Enemy Actions</button>
      </div>
      <h4>Selected Unit Overrides ${selectedUnit ? `(${selectedUnit.name})` : ""}</h4>
      <div class="debug-grid">
        <label>HP <input data-debug-field="unit-hp" type="number" value="${selectedUnit?.hp ?? ""}" /></label>
        <label>Max HP <input data-debug-field="unit-max-health" type="number" value="${selectedUnit?.maxHealth ?? ""}" /></label>
        <label>ATK <input data-debug-field="unit-attack" type="number" value="${selectedUnit?.attack ?? ""}" /></label>
        <label>ARM <input data-debug-field="unit-armor" type="number" value="${selectedUnit?.armor ?? ""}" /></label>
        <label>MOV <input data-debug-field="unit-movement" type="number" value="${selectedUnit?.movement ?? ""}" /></label>
        <label>Min RNG <input data-debug-field="unit-min-range" type="number" value="${selectedUnit?.minRange ?? ""}" /></label>
        <label>Max RNG <input data-debug-field="unit-max-range" type="number" value="${selectedUnit?.maxRange ?? ""}" /></label>
        <label>STA <input data-debug-field="unit-stamina" type="number" value="${selectedUnit?.stamina ?? ""}" /></label>
        <label>Max STA <input data-debug-field="unit-max-stamina" type="number" /></label>
        <label>Ammo <input data-debug-field="unit-ammo" type="number" value="${selectedUnit?.ammo ?? ""}" /></label>
        <label>Max Ammo <input data-debug-field="unit-max-ammo" type="number" /></label>
        <label>Luck <input data-debug-field="unit-luck" type="number" /></label>
        <label>Level <input data-debug-field="unit-level" type="number" value="${selectedUnit?.level ?? ""}" min="1" /></label>
        <label>XP <input data-debug-field="unit-experience" type="number" value="${selectedUnit?.experience ?? ""}" min="0" /></label>
      </div>
      <div class="battle-actions">
        <button class="menu-button menu-button--small" data-action="debug-apply-selected-stats" ${
          selectedUnit ? "" : "disabled"
        }>
          Apply To Selected Unit
        </button>
      </div>
    </div>
  `;
}

function renderPauseOverlay(state, battleSnapshot) {
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
              ${renderDebugControls(state, battleSnapshot)}
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
  const fundsGain = state.battleUi?.fundsGain ?? null;
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
        ${renderTargetReference(battleSnapshot, state.battleUi?.hoveredTile)}
        ${renderSelectionDetails(battleSnapshot)}
        ${renderRecruitPanel(battleSnapshot)}
      </aside>
      <div class="battle-topbar">
        <div>
          <p class="eyebrow">${battleSnapshot.map.name}</p>
          <h2>Map ${state.runState.mapIndex + 1}/${state.runState.targetMapCount}</h2>
        </div>
        <div class="battle-topbar__funds">
          ${renderFundsPanel("Player Funds", battleSnapshot.player.funds, "player", "funds-panel--player", fundsGain)}
          ${renderFundsPanel("Enemy Funds", battleSnapshot.enemy.funds, "enemy", "funds-panel--enemy", fundsGain)}
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
      ${renderTransportPrompt(battleSnapshot)}
      ${renderSupportPrompt(battleSnapshot)}
      ${renderTurnBanner(turnBanner)}
      ${suppressLevelUpOverlay ? "" : renderLevelUpOverlay(battleSnapshot)}
      ${renderPauseOverlay(state, battleSnapshot)}
      ${suppressOutcomeOverlay ? "" : renderOutcomeOverlay(state, battleSnapshot)}
    </div>
  `;
}
