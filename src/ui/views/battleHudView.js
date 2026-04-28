import { BATTLE_NOTICE_DISPLAY_MS, BUILDING_KEYS, TERRAIN_KEYS, TURN_SIDES } from "../../game/core/constants.js";
import { getBattlefieldLayout } from "../../game/core/battlefieldLayout.js";
import { getCommanderById, getCommanderPowerMax } from "../../game/content/commanders.js";
import { getCommanderPortraitImageUrl } from "../../game/content/commanderArt.js";
import { UNIT_CATALOG } from "../../game/content/unitCatalog.js";
import { getArmorModifier } from "../../game/simulation/commanderEffects.js";
import { getPositionArmorBonus } from "../../game/simulation/combatResolver.js";
import { buildFocusedTile } from "../../game/simulation/battlePresentation.js";
import { renderOptionFields } from "./optionFieldsView.js";

function formatCostLabel(cost) {
  return cost >= 99 ? "Blocked" : `${cost}`;
}

function formatRangeLabel(minimumRange, maximumRange) {
  return minimumRange === maximumRange
    ? `${maximumRange}`
    : `${minimumRange}-${maximumRange}`;
}

function getMeterWidthPercent(current, maximum) {
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (current / maximum) * 100));
}

function renderSelectionIcon(iconName) {
  switch (iconName) {
    case "attack":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 18L18 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M13 5h6v6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 13l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "armor":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4l6 2.5v5.3c0 4.1-2.4 6.8-6 8.7-3.6-1.9-6-4.6-6-8.7V6.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      `;
    case "movement":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 15l3-3 3 1 2-5 4 1" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 18.5a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8zm8 0a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8z" fill="currentColor"/>
        </svg>
      `;
    case "range":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M12 4v3M12 17v3M4 12h3M17 12h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="1.8" fill="currentColor"/>
        </svg>
      `;
    case "ammo":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 5h4v3.2l1.7 1.8V18a2 2 0 01-2 2h-3.4a2 2 0 01-2-2V10l1.7-1.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M10 8h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "stamina":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 3L7 13h4l-1 8 7-11h-4l0-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      `;
    case "command":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 18V9l6-4 6 4v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M9 18v-4h6v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M8 7.5h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "barracks":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 18V9l7-4 7 4v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M9 18v-4h6v4M8.5 11h1M12 11h1M15.5 11h1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "motor-pool":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 15V9h10l3 3v3H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <circle cx="8" cy="17" r="1.8" fill="none" stroke="currentColor" stroke-width="2"/>
          <circle cx="16" cy="17" r="1.8" fill="none" stroke="currentColor" stroke-width="2"/>
        </svg>
      `;
    case "airfield":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v16M8 10l4 2 4-2M9 18l3-2 3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    case "sector":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 20V5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M8 6h8l-2.2 3L16 12H8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      `;
    case "hospital":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "repair-station":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 6.5a3.5 3.5 0 01-4.8 4.8l-4.9 4.9 2 2 4.9-4.9a3.5 3.5 0 004.8-4.8l-2.2 2.2-2.8-2.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      `;
    case "plain":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 18c1.5-3 3.2-4.7 6-6.2M12 18c1-2.1 2.3-3.8 4.8-5.3M8.5 10.5L10 7M14.5 11L16 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "road":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 20l2-16M15 20l-2-16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M12 7v2M12 12v2M12 17v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "forest":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5l4 5h-2l3 4h-3l2 4H8l2-4H7l3-4H8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      `;
    case "mountain":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 18l5-8 3 4 3-6 5 10H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      `;
    case "water":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 10c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2M4 15c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "ridge":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 18l4-5 3 3 3-6 6 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M6 9l2-3 2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      `;
    default:
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
        </svg>
      `;
  }
}

function getBuildingIconName(buildingType) {
  switch (buildingType) {
    case BUILDING_KEYS.COMMAND:
      return "command";
    case BUILDING_KEYS.BARRACKS:
      return "barracks";
    case BUILDING_KEYS.MOTOR_POOL:
      return "motor-pool";
    case BUILDING_KEYS.AIRFIELD:
      return "airfield";
    case BUILDING_KEYS.SECTOR:
      return "sector";
    case BUILDING_KEYS.HOSPITAL:
      return "hospital";
    case BUILDING_KEYS.REPAIR_STATION:
      return "repair-station";
    default:
      return "building";
  }
}

function getTerrainIconName(terrainId) {
  switch (terrainId) {
    case TERRAIN_KEYS.PLAIN:
      return "plain";
    case TERRAIN_KEYS.ROAD:
      return "road";
    case TERRAIN_KEYS.FOREST:
      return "forest";
    case TERRAIN_KEYS.MOUNTAIN:
      return "mountain";
    case TERRAIN_KEYS.WATER:
      return "water";
    case TERRAIN_KEYS.RIDGE:
      return "ridge";
    default:
      return "terrain";
  }
}

function renderStatCell(iconName, label, value) {
  return `
    <div class="selection-stat">
      <span class="selection-stat__label">
        <span class="selection-icon selection-icon--stat" aria-hidden="true">${renderSelectionIcon(iconName)}</span>
        <span>${label}</span>
      </span>
      <strong>${value}</strong>
    </div>
  `;
}

function renderHealthBar(unit) {
  const healthRatio = getMeterWidthPercent(unit.hp, unit.maxHealth);

  return `
    <div class="selection-health">
      <span class="selection-health__label">HP</span>
      <div class="selection-health__bar" aria-label="Health ${unit.hp} out of ${unit.maxHealth}">
        <div
          class="selection-health__fill"
          data-meter-fill="hp"
          data-meter-value="${healthRatio}"
          style="width:${healthRatio}%"
        ></div>
        <span class="selection-health__value">${unit.hp}/${unit.maxHealth}</span>
      </div>
    </div>
  `;
}

function renderUnitStatGrid(unit) {
  const armorLabel = unit.positionArmorBonus > 0
    ? `${unit.armor} (+${unit.positionArmorBonus})`
    : `${unit.armor}`;

  return `
    <div class="selection-stat-grid">
      ${renderStatCell("attack", "ATK", unit.attack)}
      ${renderStatCell("armor", "ARM", armorLabel)}
      ${renderStatCell("movement", "MOV", unit.movement)}
      ${renderStatCell("range", "RNG", formatRangeLabel(unit.minRange, unit.maxRange))}
      ${renderStatCell("ammo", "AMMO", `${unit.ammo}/${unit.ammoMax}`)}
      ${renderStatCell("stamina", "STA", `${unit.stamina}/${unit.staminaMax}`)}
    </div>
  `;
}

function renderUnitSummary(unit, { showExperience = false } = {}) {
  return `
    <div class="selection-section" data-selection-unit-card="${unit.id ?? ""}">
      <div class="selection-unit-heading">
        <div class="selection-unit-heading__title">
          <strong>${unit.name}</strong>
          <span class="selection-level-badge" aria-label="Level ${unit.level}">${unit.level}</span>
        </div>
      </div>
      ${renderHealthBar(unit)}
      ${renderUnitStatGrid(unit)}
    </div>
    ${showExperience ? renderExperienceBar(unit) : ""}
  `;
}

function renderFeatureSection(iconName, title, lines, modifierClass = "") {
  return `
    <div class="selection-section ${modifierClass}">
      <div class="selection-feature">
        <span class="selection-icon selection-icon--feature" aria-hidden="true">${renderSelectionIcon(iconName)}</span>
        <div class="selection-feature__body">
          <strong>${title}</strong>
          ${lines.map((line) => `<p>${line}</p>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function getTerrainTraversalText(terrain) {
  if (terrain.blocksGround) {
    return "Ground units cannot cross this tile.";
  }

  if (terrain.blockedFamilies?.length) {
    return `${terrain.blockedFamilies.join(", ")} units cannot cross this tile.`;
  }

  return "Ground units can traverse this tile.";
}

function renderExperienceBar(unit) {
  const experienceRatio = Math.max(6, unit.experienceRatio * 100);

  return `
    <div class="selection-section selection-section--xp">
      <div class="selection-header">
        <strong>Experience</strong>
        <span>${unit.experience}/${unit.experienceToNextLevel}</span>
      </div>
      <div class="meter meter--exp">
        <div class="meter__bar">
          <div
            data-meter-fill="xp"
            data-meter-value="${experienceRatio}"
            style="width:${experienceRatio}%"
          ></div>
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
    battleSnapshot.turn.activeSide !== TURN_SIDES.PLAYER ||
    battleSnapshot.presentation?.pendingAction
  ) {
    return false;
  }

  return battleSnapshot.player.units.some((unit) => !unit.hasMoved && unit.current.hp > 0);
}

function canActivatePlayerPower(battleSnapshot) {
  return Boolean(
    battleSnapshot &&
      !battleSnapshot.victory &&
      battleSnapshot.turn.activeSide === TURN_SIDES.PLAYER &&
      !battleSnapshot.presentation?.pendingAction &&
      battleSnapshot.player.charge >= getCommanderPowerMax(battleSnapshot.player.commanderId)
  );
}

function isPlayerPowerCharged(battleSnapshot) {
  if (!battleSnapshot) {
    return false;
  }

  return battleSnapshot.player.charge >= getCommanderPowerMax(battleSnapshot.player.commanderId);
}

function renderCommanderPowerControl(commander, sideState, side, { canActivatePower = false, isCharged = false } = {}) {
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

function renderCommanderPanel(
  commander,
  sideState,
  side,
  { fundsGain = null, canActivatePower = false, isCharged = false } = {}
) {
  const sideLabel = side === "player" ? "Player Commander" : "Enemy Commander";
  const portraitImageUrl = getCommanderPortraitImageUrl(sideState.commanderId);

  return `
    <div class="commander-panel commander-panel--${side}" style="--accent:${commander.accent}">
      <div class="commander-panel__header">
        <div class="commander-panel__summary">
          <p class="eyebrow">${sideLabel}</p>
          <h2>${commander.name}</h2>
          ${renderFundsPanel("Funds", sideState.funds, side, `funds-panel--${side} funds-panel--commander`, fundsGain)}
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

function renderSelectionDetails(selectedTile, { title, emptyTitle, emptyBody } = {}) {
  if (!selectedTile) {
    return `
      <div class="card-block">
        <h3>${emptyTitle ?? title ?? "Selection"}</h3>
        <p>${emptyBody ?? "Select a unit, building, or tile on the battlefield to inspect it here."}</p>
      </div>
    `;
  }

  const unit = selectedTile.unit;
  const building = selectedTile.building;

  return `
    <div class="card-block">
      <div class="selection-header">
        <h3>${title ?? "Selection"}</h3>
      </div>
      ${unit ? renderUnitSummary(unit, { showExperience: true }) : ""}
      ${
        building
          ? renderFeatureSection(
              getBuildingIconName(building.type),
              building.name,
              [
                building.summary,
                building.canRecruit
                  ? `Function: Produces ${building.recruitmentFamilies.length} unit types.`
                  : "",
                building.income > 0 ? `Income: +${building.income} funds each turn.` : ""
              ].filter(Boolean)
            )
          : ""
      }
      ${renderFeatureSection(
        getTerrainIconName(selectedTile.terrain.id),
        selectedTile.terrain.label,
        [
          `Infantry cost ${formatCostLabel(selectedTile.terrain.moveCost)} | Vehicles cost ${formatCostLabel(selectedTile.terrain.vehicleMoveCost)}`,
          `Armor bonus: +${selectedTile.terrain.armorBonus ?? 0}`,
          getTerrainTraversalText(selectedTile.terrain)
        ],
        "selection-section--terrain"
      )}
    </div>
  `;
}

function getSelectedTileFocusSide(battleSnapshot, selectedTile) {
  if (!battleSnapshot || !selectedTile) {
    return null;
  }

  if (selectedTile.unit?.owner) {
    return selectedTile.unit.owner;
  }

  if (selectedTile.building?.owner === TURN_SIDES.PLAYER || selectedTile.building?.owner === TURN_SIDES.ENEMY) {
    return selectedTile.building.owner;
  }

  return battleSnapshot.turn.activeSide === TURN_SIDES.ENEMY ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;
}

function getFocusTileForSide(battleSnapshot, battleUi, side) {
  const selectedTile = battleSnapshot.presentation?.selectedTile;
  const selectedTileSide = getSelectedTileFocusSide(battleSnapshot, selectedTile);

  if (selectedTile && selectedTileSide === side) {
    return selectedTile;
  }

  if (side === TURN_SIDES.ENEMY) {
    return null;
  }

  const focus = side === TURN_SIDES.PLAYER ? battleUi?.playerFocus : battleUi?.enemyFocus;
  return buildFocusedTile(battleSnapshot, focus);
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
  const targetView = {
    name: target.name,
    level: target.level,
    hp: target.current.hp,
    maxHealth: target.stats.maxHealth,
    attack: target.stats.attack,
    armor: target.stats.armor + getArmorModifier(battleSnapshot, target),
    positionArmorBonus: getPositionArmorBonus(battleSnapshot, target),
    movement: target.stats.movement,
    minRange: target.stats.minRange,
    maxRange: target.stats.maxRange,
    stamina: target.current.stamina,
    staminaMax: target.stats.staminaMax,
    ammo: target.current.ammo,
    ammoMax: target.stats.ammoMax
  };

  return `
    <div class="card-block card-block--target-reference">
      <div class="selection-header">
        <h3>Target</h3>
      </div>
      ${renderUnitSummary(targetView)}
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
    pendingAction.isChoosingSupport ||
    pendingAction.isUnloading
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

function renderCommandFeed(log, hoveredTile) {
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

function renderUnloadPrompt(battleSnapshot) {
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

function renderBattleNotice(notice) {
  if (!notice) {
    return "";
  }

  const durationMs = Math.max(1, Number(notice.durationMs) || BATTLE_NOTICE_DISPLAY_MS);
  const createdAt = Number(notice.createdAt) || Date.now();
  const elapsedMs = Math.max(0, Math.min(durationMs - 1, Date.now() - createdAt));
  const noticeStyle = `--notice-duration:${durationMs}ms;--notice-delay:-${elapsedMs}ms;`;

  return `
    <div class="battle-notice battle-notice--${notice.tone ?? "info"}" style="${noticeStyle}" role="status" aria-live="polite">
      <strong>${notice.title}</strong>
      <span>${notice.message}</span>
    </div>
  `;
}

function renderPowerOverlay(powerOverlay) {
  if (!powerOverlay) {
    return "";
  }

  const sideLabel = powerOverlay.side === TURN_SIDES.PLAYER ? "Player Power" : "Enemy Power";

  return `
    <div class="battle-overlay battle-overlay--power battle-overlay--power-${powerOverlay.side}" style="--accent:${powerOverlay.accent}">
      <div class="overlay-card overlay-card--power">
        <p class="eyebrow">${sideLabel} Activated</p>
        <h2>${powerOverlay.title}</h2>
        <strong>${powerOverlay.commanderName}</strong>
        <p>${powerOverlay.summary}</p>
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
  const defaultSpawnUnit = UNIT_CATALOG.grunt ?? Object.values(UNIT_CATALOG)[0];
  const unitOptions = Object.values(UNIT_CATALOG)
    .map(
      (unit) => `<option
        value="${unit.id}"
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

  return `
    <div class="debug-panel">
      <details class="debug-section" open>
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
      <details class="debug-section">
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
      <details class="debug-section">
        <summary>
          <span>
            <strong>Selected Unit Overrides</strong>
            <small>${selectedUnit ? selectedUnit.name : "No unit selected"}</small>
          </span>
        </summary>
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
              ${state.debugMode ? `
                <details class="pause-section" open>
                  <summary>
                    <span>
                      <strong>Debug Toolkit</strong>
                      <small>Spawn, charge, and stat tools</small>
                    </span>
                  </summary>
                  ${renderDebugControls(state, battleSnapshot)}
                </details>
              ` : ""}
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
  const playerPowerEnabled = canActivatePlayerPower(battleSnapshot);
  const playerPowerCharged = isPlayerPowerCharged(battleSnapshot);
  const fundsGain = state.battleUi?.fundsGain ?? null;
  const playerFocusTile = getFocusTileForSide(battleSnapshot, state.battleUi, TURN_SIDES.PLAYER);
  const enemyFocusTile = getFocusTileForSide(battleSnapshot, state.battleUi, TURN_SIDES.ENEMY);

  return `
    <div class="battle-shell">
      <input class="battle-drawer-toggle" id="battle-intel-drawer" type="checkbox" aria-hidden="true" />
      <input class="battle-drawer-toggle" id="battle-command-drawer" type="checkbox" aria-hidden="true" />
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
      <aside class="battle-rail battle-rail--left">
        <div class="battle-drawer-header">
          <span>Player Intel</span>
          <label class="ghost-button ghost-button--small" for="battle-intel-drawer">Close</label>
        </div>
        ${renderCommanderPanel(playerCommander, battleSnapshot.player, "player", {
          fundsGain,
          canActivatePower: playerPowerEnabled,
          isCharged: playerPowerCharged
        })}
        ${renderSelectionDetails(playerFocusTile, {
          title: "Player Selection",
          emptyTitle: "Player Intel",
          emptyBody: "Select a friendly unit, building, or tile to pin player-side intel here."
        })}
        ${renderRecruitPanel(battleSnapshot)}
      </aside>
      <aside class="battle-rail battle-rail--right">
        <div class="battle-drawer-header">
          <span>Enemy Intel</span>
          <label class="ghost-button ghost-button--small" for="battle-command-drawer">Close</label>
        </div>
        ${renderCommanderPanel(enemyCommander, battleSnapshot.enemy, "enemy", { fundsGain })}
        ${renderTargetReference(battleSnapshot, state.battleUi?.hoveredTile)}
        ${renderSelectionDetails(enemyFocusTile, {
          title: "Enemy Selection",
          emptyTitle: "Enemy Intel",
          emptyBody: "Enemy scans and hostile unit details will appear here."
        })}
        ${renderCommandFeed(battleSnapshot.log, state.battleUi?.hoveredTile)}
      </aside>
      ${renderActionPrompt(battleSnapshot)}
      ${renderTargetingPrompt(battleSnapshot)}
      ${renderUnloadPrompt(battleSnapshot)}
      ${renderTransportPrompt(battleSnapshot)}
      ${renderSupportPrompt(battleSnapshot)}
      ${renderBattleNotice(state.battleUi?.notice)}
      ${renderTurnBanner(turnBanner)}
      ${renderPowerOverlay(state.battleUi?.powerOverlay)}
      ${suppressLevelUpOverlay ? "" : renderLevelUpOverlay(battleSnapshot)}
      ${renderPauseOverlay(state, battleSnapshot)}
      ${suppressOutcomeOverlay ? "" : renderOutcomeOverlay(state, battleSnapshot)}
    </div>
  `;
}
