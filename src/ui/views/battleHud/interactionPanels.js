import { BATTLE_MODES, UNIT_TAGS } from "../../../game/core/constants.js";
import { getBattlefieldLayout } from "../../../game/core/battlefieldLayout.js";
import {
  COMMANDERS,
  getCommanderById,
  getEnemyAiArchetypeLabel
} from "../../../game/content/commanders.js";
import { MAP_POOL } from "../../../game/content/maps.js";
import { ENEMY_AI_ARCHETYPE_ORDER } from "../../../game/core/constants.js";
import {
  getBattleEffectiveRunUpgrades,
  getGearFamilyLabel,
  RUN_CARD_TYPES,
  RUN_UPGRADES,
  RUN_UPGRADE_RARITY_LABELS
} from "../../../game/content/runUpgrades.js";
import { UNIT_CATALOG } from "../../../game/content/unitCatalog.js";

const DEBUG_GEAR_UPGRADES = RUN_UPGRADES.filter((upgrade) => upgrade.type === RUN_CARD_TYPES.GEAR);
const DEBUG_RUN_CARD_UPGRADES = RUN_UPGRADES.filter(
  (upgrade) => !upgrade.hidden && upgrade.type !== RUN_CARD_TYPES.UNIT
);

function renderDebugGearOptions(selectedSlot = null, eligibleFamily = null) {
  const normalizedSelectedSlot =
    DEBUG_GEAR_UPGRADES.some(
      (upgrade) => upgrade.id === selectedSlot && (!eligibleFamily || upgrade.eligibleFamily === eligibleFamily)
    )
      ? selectedSlot
      : null;

  return [
    `<option value="" ${normalizedSelectedSlot ? "" : "selected"}>No Gear</option>`,
    ...DEBUG_GEAR_UPGRADES.map((upgrade) => {
      const isEligible = !eligibleFamily || upgrade.eligibleFamily === eligibleFamily;
      const labelSuffix = upgrade.eligibleFamily === UNIT_TAGS.INFANTRY ? " (Infantry)" : "";
      return `<option
        value="${upgrade.id}"
        data-eligible-family="${upgrade.eligibleFamily ?? ""}"
        ${upgrade.id === normalizedSelectedSlot ? "selected" : ""}
        ${isEligible ? "" : "disabled"}
      >${upgrade.name}${labelSuffix}</option>`;
    })
  ].join("");
}

function renderDebugRunCardOptions() {
  return DEBUG_RUN_CARD_UPGRADES.map((upgrade) => {
    const rarityLabel = RUN_UPGRADE_RARITY_LABELS[upgrade.rarity] ?? "Card";
    const gearLabel = upgrade.type === RUN_CARD_TYPES.GEAR ? ` | ${getGearFamilyLabel(upgrade)} Gear` : "";
    return `<option value="${upgrade.id}">${upgrade.name} | ${rarityLabel}${gearLabel}</option>`;
  }).join("");
}

function getSandboxBaseMapId(mapId) {
  if (!mapId) {
    return MAP_POOL[0]?.id ?? "";
  }

  if (MAP_POOL.some((mapDefinition) => mapDefinition.id === mapId)) {
    return mapId;
  }

  if (mapId.endsWith("-run")) {
    const baseMapId = mapId.slice(0, -4);

    if (MAP_POOL.some((mapDefinition) => mapDefinition.id === baseMapId)) {
      return baseMapId;
    }
  }

  return MAP_POOL[0]?.id ?? "";
}

function getBattleLayout(battleSnapshot) {
  if (typeof window === "undefined") {
    return null;
  }

  return getBattlefieldLayout({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    mapWidth: battleSnapshot.map.width,
    mapHeight: battleSnapshot.map.height
  });
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

export function renderActionPrompt(battleSnapshot) {
  const pendingAction = battleSnapshot.presentation?.pendingAction;

  if (
    !pendingAction ||
    pendingAction.isTargeting ||
    pendingAction.isChoosingTransport ||
    pendingAction.isChoosingSupport ||
    pendingAction.isChoosingMedpack ||
    pendingAction.isChoosingExtinguish ||
    pendingAction.isUnloading
  ) {
    return "";
  }

  return `
    <div class="battle-command-prompt" style="${getActionPromptStyle(battleSnapshot, pendingAction)}">
      <div class="battle-command-prompt__card">
        <div class="battle-command-prompt__header">
          <p class="eyebrow">${pendingAction.isSlipstream ? "Slipstream" : "Unit Orders"}</p>
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
            pendingAction.canRescue
              ? '<button class="battle-command-prompt__action battle-command-prompt__action--capture" data-action="rescue-hostage">Rescue</button>'
              : ""
          }
          ${
            pendingAction.canDropOff
              ? '<button class="battle-command-prompt__action battle-command-prompt__action--primary" data-action="drop-off-hostage">Drop Off</button>'
              : ""
          }
          ${
            pendingAction.canSupport
              ? `<button class="battle-command-prompt__action" data-action="use-support">${pendingAction.supportActionLabel ?? "Support"}</button>`
              : ""
          }
          ${
            pendingAction.canUseMedpack
              ? '<button class="battle-command-prompt__action" data-action="use-medpack">Medpack</button>'
              : ""
          }
          ${
            pendingAction.canExtinguish
              ? '<button class="battle-command-prompt__action" data-action="use-extinguish">Extinguish</button>'
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
          ${
            pendingAction.isSlipstream
              ? ""
              : '<button class="battle-command-prompt__action battle-command-prompt__action--subtle" data-action="redo-move">Redo</button>'
          }
        </div>
      </div>
    </div>
  `;
}

export function renderCommandFeed(log, hoveredTile) {
  const hoveredTileLabel = hoveredTile
    ? `Tile ${hoveredTile.x + 1},${hoveredTile.y + 1}`
    : null;

  return `
    <div class="card-block">
      <div class="selection-header">
        <h3>Command Feed</h3>
        ${hoveredTileLabel ? `<span class="selection-chip">${hoveredTileLabel}</span>` : ""}
      </div>
      <div class="log-feed">
        ${log.map((line) => `<p>${line}</p>`).join("")}
      </div>
    </div>
  `;
}

export function renderSupportPrompt(battleSnapshot) {
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

export function renderMedpackPrompt(battleSnapshot) {
  const pendingAction = battleSnapshot.presentation?.pendingAction;

  if (!pendingAction?.isChoosingMedpack) {
    return "";
  }

  return `
    <div class="battle-targeting-hint">
      <div class="battle-targeting-hint__copy">
        <p class="eyebrow">Medpack Mode</p>
        <strong>${pendingAction.unitName} ready to use a medpack</strong>
        <span>Select the acting unit or a highlighted infantry ally.</span>
      </div>
      <button class="ghost-button ghost-button--small battle-targeting-hint__cancel" data-action="cancel-medpack-choice">Cancel</button>
    </div>
  `;
}

export function renderExtinguishPrompt(battleSnapshot) {
  const pendingAction = battleSnapshot.presentation?.pendingAction;

  if (!pendingAction?.isChoosingExtinguish) {
    return "";
  }

  return `
    <div class="battle-targeting-hint">
      <div class="battle-targeting-hint__copy">
        <p class="eyebrow">Extinguish Mode</p>
        <strong>${pendingAction.unitName} is ready to put out a fire</strong>
        <span>Select a highlighted burned ally or cancel.</span>
      </div>
      <button class="ghost-button ghost-button--small battle-targeting-hint__cancel" data-action="cancel-extinguish-choice">Cancel</button>
    </div>
  `;
}

export function renderTransportPrompt(battleSnapshot) {
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

export function renderTargetingPrompt(battleSnapshot) {
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

export function renderUnloadPrompt(battleSnapshot) {
  const pendingAction = battleSnapshot.presentation?.pendingAction;

  if (!pendingAction?.isUnloading) {
    return "";
  }

  return `
    <div class="battle-targeting-hint">
      <div class="battle-targeting-hint__copy">
        <p class="eyebrow">Unload Mode</p>
        <strong>${pendingAction.unitName} ready to unload</strong>
        <span>Select a highlighted tile or cancel.</span>
      </div>
      <button class="ghost-button ghost-button--small battle-targeting-hint__cancel" data-action="cancel-unload-choice">Cancel</button>
    </div>
  `;
}

export function renderRecruitPanel(battleSnapshot) {
  if (battleSnapshot.mode === BATTLE_MODES.RUN) {
    return "";
  }

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

export function renderDebugControls(state, battleSnapshot) {
  if (!state.debugMode) {
    return "";
  }

  const selectedTile = battleSnapshot.presentation?.selectedTile;
  const selectedUnit = selectedTile?.unit;
  const selectedEditable = selectedUnit?.editable ?? null;
  const defaultSpawnUnit = UNIT_CATALOG.grunt ?? Object.values(UNIT_CATALOG)[0];
  const commanderOptions = COMMANDERS.map(
    (commander) => `<option value="${commander.id}">${commander.name}</option>`
  ).join("");
  const enemyAiOptions = ENEMY_AI_ARCHETYPE_ORDER.map(
    (archetype) => `<option value="${archetype}">${getEnemyAiArchetypeLabel(archetype)}</option>`
  ).join("");
  const unitOptions = Object.values(UNIT_CATALOG)
    .map(
      (unit) => `<option
        value="${unit.id}"
        data-family="${unit.family}"
        data-stat-attack="${unit.attack}"
        data-stat-armor="${unit.armor}"
        data-stat-max-health="${unit.maxHealth}"
        data-stat-movement="${unit.movement}"
        data-stat-min-range="${unit.minRange}"
        data-stat-max-range="${unit.maxRange}"
        data-stat-max-stamina="${unit.staminaMax}"
        data-stat-max-ammo="${unit.ammoMax}"
        data-stat-luck="${unit.luck}"
        ${unit.id === defaultSpawnUnit?.id ? "selected" : ""}
      >${unit.name}</option>`
    )
    .join("");
  const spawnX = selectedTile?.x ?? 0;
  const spawnY = selectedTile?.y ?? 0;
  const selectedSandboxMapId = getSandboxBaseMapId(battleSnapshot.map.id);
  const selectedSandboxMap =
    MAP_POOL.find((mapDefinition) => mapDefinition.id === selectedSandboxMapId) ?? MAP_POOL[0] ?? null;
  const sandboxMapOptions = MAP_POOL.map((mapDefinition) => `
      <option value="${mapDefinition.id}" ${mapDefinition.id === selectedSandboxMapId ? "selected" : ""}>
        ${mapDefinition.name} | ${mapDefinition.width}x${mapDefinition.height}
      </option>
    `).join("");
  const ownedRunCardIds = battleSnapshot.runCards?.ownedCardIds ?? state.runState?.ownedRunCardIds ?? [];
  const activeRunCards = getBattleEffectiveRunUpgrades({ runCards: { ownedCardIds: ownedRunCardIds } })
    .filter((upgrade) => !upgrade.hidden);
  const runCardSummary = activeRunCards.length > 0
    ? `${activeRunCards.length} active`
    : "No active upgrade cards";

  return `
    <div class="debug-panel">
      <details class="debug-section" data-battle-debug-accordion="battlefield" name="battle-debug-accordion">
        <summary>
          <span>
            <strong>Battlefield</strong>
            <small>${
              selectedSandboxMap
                ? `${selectedSandboxMap.name} | ${selectedSandboxMap.width}x${selectedSandboxMap.height}`
                : "Load a sandbox map"
            }</small>
          </span>
        </summary>
        <div class="debug-grid">
          <label>Map
            <select data-debug-field="sandbox-map">
              ${sandboxMapOptions}
            </select>
          </label>
        </div>
        <div class="debug-actions">
          <button class="menu-button menu-button--small" data-action="debug-load-map">Load Fresh Map</button>
        </div>
      </details>
      <details class="debug-section" data-battle-debug-accordion="spawn" name="battle-debug-accordion">
        <summary>
          <span>
            <strong>Spawn Unit</strong>
            <small>${selectedTile ? `Tile ${spawnX}, ${spawnY}` : "Any tile"}</small>
          </span>
        </summary>
        <div class="debug-grid debug-grid--spawn">
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
          <label>Gear
            <select data-debug-field="spawn-gear-slot">
              ${renderDebugGearOptions(null, defaultSpawnUnit?.family ?? null)}
            </select>
          </label>
          <label>ATK <input data-debug-field="spawn-attack" type="number" value="${defaultSpawnUnit?.attack ?? ""}" /></label>
          <label>ARM <input data-debug-field="spawn-armor" type="number" value="${defaultSpawnUnit?.armor ?? ""}" /></label>
          <label>Max HP <input data-debug-field="spawn-max-health" type="number" value="${defaultSpawnUnit?.maxHealth ?? ""}" /></label>
          <label>MOV <input data-debug-field="spawn-movement" type="number" value="${defaultSpawnUnit?.movement ?? ""}" /></label>
          <label>Min RNG <input data-debug-field="spawn-min-range" type="number" value="${defaultSpawnUnit?.minRange ?? ""}" /></label>
          <label>Max RNG <input data-debug-field="spawn-max-range" type="number" value="${defaultSpawnUnit?.maxRange ?? ""}" /></label>
          <label>Max STA <input data-debug-field="spawn-max-stamina" type="number" value="${defaultSpawnUnit?.staminaMax ?? ""}" /></label>
          <label>Max Ammo <input data-debug-field="spawn-max-ammo" type="number" value="${defaultSpawnUnit?.ammoMax ?? ""}" /></label>
          <label>Luck <input data-debug-field="spawn-luck" type="number" value="${defaultSpawnUnit?.luck ?? ""}" /></label>
        </div>
        <div class="debug-actions">
          <button class="menu-button menu-button--small" data-action="debug-spawn-unit">Spawn Unit</button>
        </div>
      </details>
      <details class="debug-section" data-battle-debug-accordion="commanders" name="battle-debug-accordion">
        <summary>
          <span>
            <strong>Commander Overrides</strong>
            <small>${getCommanderById(battleSnapshot.player.commanderId)?.name ?? "Player"} vs ${
              getCommanderById(battleSnapshot.enemy.commanderId)?.name ?? "Enemy"
            } | ${getEnemyAiArchetypeLabel(battleSnapshot.enemy.aiArchetype ?? "balanced")} AI</small>
          </span>
        </summary>
        <div class="debug-grid">
          <label>Player Commander
            <select data-debug-field="player-commander">
              ${commanderOptions.replace(
                `value="${battleSnapshot.player.commanderId}"`,
                `value="${battleSnapshot.player.commanderId}" selected`
              )}
            </select>
          </label>
          <label>Enemy Commander
            <select data-debug-field="enemy-commander">
              ${commanderOptions.replace(
                `value="${battleSnapshot.enemy.commanderId}"`,
                `value="${battleSnapshot.enemy.commanderId}" selected`
              )}
            </select>
          </label>
          <label>Enemy AI
            <select data-debug-field="enemy-ai-archetype">
              ${enemyAiOptions.replace(
                `value="${battleSnapshot.enemy.aiArchetype ?? "balanced"}"`,
                `value="${battleSnapshot.enemy.aiArchetype ?? "balanced"}" selected`
              )}
            </select>
          </label>
        </div>
        <div class="debug-actions">
          <button class="menu-button menu-button--small" data-action="debug-apply-commanders">
            Apply Commanders
          </button>
        </div>
      </details>
      <details class="debug-section" data-battle-debug-accordion="upgrade-cards" name="battle-debug-accordion">
        <summary>
          <span>
            <strong>Upgrade Cards</strong>
            <small>${runCardSummary}</small>
          </span>
        </summary>
        <div class="debug-card-list">
          ${
            activeRunCards.length > 0
              ? activeRunCards
                .map((upgrade) => `
                  <span class="debug-card-chip">
                    <strong>${upgrade.name}</strong>
                    <small>${RUN_UPGRADE_RARITY_LABELS[upgrade.rarity] ?? "Card"}</small>
                  </span>
                `)
                .join("")
              : '<p>No upgrade cards are active in this sandbox battle.</p>'
          }
        </div>
        <div class="debug-grid">
          <label>Card
            <select data-debug-field="run-card-id">
              ${renderDebugRunCardOptions()}
            </select>
          </label>
        </div>
        <div class="debug-actions">
          <button class="menu-button menu-button--small" data-action="debug-add-run-card">Add Card And Reload</button>
          <button class="ghost-button ghost-button--small" data-action="debug-clear-run-cards">Clear Cards</button>
        </div>
      </details>
      <details class="debug-section" data-battle-debug-accordion="shortcuts" name="battle-debug-accordion">
        <summary>
          <span>
            <strong>Battle Shortcuts</strong>
            <small>Charge and action resets</small>
          </span>
        </summary>
        <div class="debug-actions debug-actions--compact">
          <button class="ghost-button ghost-button--small" data-action="debug-full-charge-player">Player Full Charge</button>
          <button class="ghost-button ghost-button--small" data-action="debug-full-charge-enemy">Enemy Full Charge</button>
          <button class="ghost-button ghost-button--small" data-action="debug-refresh-player-actions">Refresh Player Actions</button>
          <button class="ghost-button ghost-button--small" data-action="debug-refresh-enemy-actions">Refresh Enemy Actions</button>
        </div>
      </details>
      <details class="debug-section" data-battle-debug-accordion="selected-unit" name="battle-debug-accordion">
        <summary>
          <span>
            <strong>Selected Unit Overrides</strong>
            <small>${selectedUnit ? `${selectedUnit.name} | Tile ${selectedTile?.x ?? 0}, ${selectedTile?.y ?? 0}` : "No unit selected"}</small>
          </span>
        </summary>
        <div class="debug-grid">
          <label>HP <input data-debug-field="unit-hp" type="number" value="${selectedEditable?.hp ?? ""}" /></label>
          <label>Max HP <input data-debug-field="unit-max-health" type="number" value="${selectedEditable?.maxHealth ?? ""}" /></label>
          <label>ATK <input data-debug-field="unit-attack" type="number" value="${selectedEditable?.attack ?? ""}" /></label>
          <label>ARM <input data-debug-field="unit-armor" type="number" value="${selectedEditable?.armor ?? ""}" /></label>
          <label>MOV <input data-debug-field="unit-movement" type="number" value="${selectedEditable?.movement ?? ""}" /></label>
          <label>Min RNG <input data-debug-field="unit-min-range" type="number" value="${selectedEditable?.minRange ?? ""}" /></label>
          <label>Max RNG <input data-debug-field="unit-max-range" type="number" value="${selectedEditable?.maxRange ?? ""}" /></label>
          <label>STA <input data-debug-field="unit-stamina" type="number" value="${selectedEditable?.stamina ?? ""}" /></label>
          <label>Max STA <input data-debug-field="unit-max-stamina" type="number" value="${selectedEditable?.staminaMax ?? ""}" /></label>
          <label>Ammo <input data-debug-field="unit-ammo" type="number" value="${selectedEditable?.ammo ?? ""}" /></label>
          <label>Max Ammo <input data-debug-field="unit-max-ammo" type="number" value="${selectedEditable?.ammoMax ?? ""}" /></label>
          <label>Luck <input data-debug-field="unit-luck" type="number" value="${selectedEditable?.luck ?? ""}" /></label>
          <label>Gear
            <select data-debug-field="unit-gear-slot" ${selectedUnit ? "" : "disabled"}>
              ${renderDebugGearOptions(selectedEditable?.gearSlot ?? null, selectedUnit?.family ?? null)}
            </select>
          </label>
          <label>Level <input data-debug-field="unit-level" type="number" value="${selectedEditable?.level ?? ""}" min="1" /></label>
          <label>XP <input data-debug-field="unit-experience" type="number" value="${selectedEditable?.experience ?? ""}" min="0" /></label>
        </div>
        <div class="debug-actions">
          <button class="menu-button menu-button--small" data-action="debug-apply-selected-stats" ${
            selectedUnit ? "" : "disabled"
          }>
            Apply To Selected Unit
          </button>
        </div>
      </details>
    </div>
  `;
}
