import {
  BUILDING_KEYS,
  TERRAIN_KEYS,
  TURN_SIDES
} from "../../../game/core/constants.js";
import { RUN_UPGRADES } from "../../../game/content/runUpgrades.js";
import { getArmorModifier } from "../../../game/simulation/commanderEffects.js";
import { getPositionArmorBonus } from "../../../game/simulation/combatResolver.js";
import { buildFocusedTile } from "../../../game/simulation/battlePresentation.js";
import { formatRangeLabel, renderSelectionIcon } from "../../shared/unitStatPresentation.js";

function formatCostLabel(cost) {
  return cost >= 99 ? "Blocked" : `${cost}`;
}

function getMeterWidthPercent(current, maximum) {
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (current / maximum) * 100));
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

function renderUnitSummary(unit, { showExperience = false } = {}) {
  const attachedGear = unit.gear?.slot
    ? RUN_UPGRADES.find((upgrade) => upgrade.id === unit.gear.slot) ?? { name: unit.gear.slot, summary: "" }
    : null;

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
      ${
        attachedGear
          ? `
            <div class="selection-header">
              <strong>Gear</strong>
              <span>${attachedGear.name}</span>
            </div>
            ${attachedGear.summary ? `<p>${attachedGear.summary}</p>` : ""}
          `
          : ""
      }
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

export function renderSelectionDetails(selectedTile, { title, emptyTitle, emptyBody } = {}) {
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
                `Owner: ${building.ownerLabel}`,
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

export function getFocusTileForSide(battleSnapshot, battleUi, side) {
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

export function renderTargetReference(battleSnapshot, hoveredTile) {
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
        <p>${target.name}</p>
        <p>Damage ${forecast.dealt.min}-${forecast.dealt.max} | Counter ${counterLabel}</p>
      </div>
    </div>
  `;
}
