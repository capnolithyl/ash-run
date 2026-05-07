import {
  BUILDING_KEYS,
  TERRAIN_KEYS,
  TURN_SIDES
} from "../../../game/core/constants.js";
import { getBuildingArmorBonusForType } from "../../../game/content/buildings.js";
import { getPositionArmorBonus } from "../../../game/simulation/combatResolver.js";
import { buildFocusedTile, describeUnit } from "../../../game/simulation/battlePresentation.js";
import {
  formatRangeLabel,
  getBattleHudArmorIconUrl,
  getBattleHudStatIconUrl,
  getBattleHudWeaponIconUrl,
  renderSelectionIcon
} from "../../shared/unitStatPresentation.js";

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

const CORRUPTED_ICON_URL = "./assets/img/icons/battle-hud/conditions/corrupted.png";
const SLOW_ICON_URL = "./assets/img/icons/battle-hud/conditions/slow.png";
const BURN_ICON_URL = "./assets/img/icons/battle-hud/conditions/burn.png";

function getStatBackgroundUrl(iconName) {
  switch (iconName) {
    case "attack":
      return getBattleHudStatIconUrl("atk.png");
    case "armor":
      return getBattleHudStatIconUrl("arm.png");
    case "movement":
      return getBattleHudStatIconUrl("mov.png");
    case "range":
      return getBattleHudStatIconUrl("rng.png");
    case "ammo":
      return getBattleHudStatIconUrl("ammo.png");
    case "stamina":
      return getBattleHudStatIconUrl("sta.png");
    default:
      return "";
  }
}

function renderStatCell(iconName, label, value, { isCorrupted = false, isSlowed = false } = {}) {
  const conditionLabels = [];

  if (isCorrupted) {
    conditionLabels.push("corrupted");
  }

  if (isSlowed) {
    conditionLabels.push("slowed");
  }

  const ariaLabel = `${label} ${value}${conditionLabels.length ? ` ${conditionLabels.join(" ")}` : ""}`;
  const conditionIcon = isCorrupted
    ? {
        src: CORRUPTED_ICON_URL,
        alt: "Corrupted",
        className: "selection-stat__condition-icon selection-stat__condition-icon--corrupted"
      }
    : isSlowed
      ? {
          src: SLOW_ICON_URL,
          alt: "Slowed",
          className: "selection-stat__condition-icon selection-stat__condition-icon--slow"
        }
      : null;

  return `
    <div
      class="selection-stat${isCorrupted ? " selection-stat--corrupted" : ""}${isSlowed ? " selection-stat--slowed" : ""}"
      aria-label="${ariaLabel}"
      style="--stat-bg-image:url('${getStatBackgroundUrl(iconName)}')"
    >
      ${
        conditionIcon
          ? `
            <img
              class="${conditionIcon.className}"
              src="${conditionIcon.src}"
              alt="${conditionIcon.alt}"
              loading="lazy"
              decoding="async"
            />
          `
          : ""
      }
      <div class="selection-stat__content">
        <span class="selection-stat__label">${label}</span>
        <strong>${value}</strong>
      </div>
    </div>
  `;
}

function formatProfileName(value, fallback = "Unknown") {
  if (!value) {
    return fallback;
  }

  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getWeaponClassIconFileName(weaponClass) {
  return weaponClass ? `${weaponClass.replaceAll("_", "-")}.png` : null;
}

function getArmorClassIconFileName(armorClass) {
  return armorClass ? `${armorClass.replaceAll("_", "-")}.png` : null;
}

function renderLoadoutSection(iconUrl, label, value) {
  return `
    <div class="selection-loadout-card">
      ${
        iconUrl
          ? `<img class="selection-loadout-card__icon" src="${iconUrl}" alt="" loading="lazy" decoding="async" />`
          : ""
      }
      <div class="selection-loadout-card__copy">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    </div>
  `;
}

function renderProfileSummary(unit) {
  const armorName = unit?.armorClass ? `${formatProfileName(unit.armorClass)} Armor` : "Unarmored";
  const weaponIconFileName = getWeaponClassIconFileName(unit.weaponClass);
  const armorIconFileName = getArmorClassIconFileName(unit.armorClass);

  return `
    <div class="selection-loadout-grid">
      ${renderLoadoutSection(
        weaponIconFileName ? getBattleHudWeaponIconUrl(weaponIconFileName) : "",
        "Weapon",
        formatProfileName(unit.weaponClass, "Unarmed")
      )}
      ${renderLoadoutSection(
        armorIconFileName ? getBattleHudArmorIconUrl(armorIconFileName) : "",
        "Armor",
        armorName
      )}
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
      ${renderStatCell("attack", "ATK", unit.attack, { isCorrupted: unit.corruptedStat === "attack" })}
      ${renderStatCell("armor", "ARM", armorLabel, { isCorrupted: unit.corruptedStat === "armor" })}
      ${renderStatCell("movement", "MOV", unit.movement, { isSlowed: unit.isSlowed })}
      ${renderStatCell("range", "RNG", formatRangeLabel(unit.minRange, unit.maxRange), {
        isCorrupted: unit.corruptedStat === "range"
      })}
      ${renderStatCell("ammo", "AMMO", `${unit.ammo}/${unit.ammoMax}`, {
        isCorrupted: unit.corruptedStat === "ammo"
      })}
      ${renderStatCell("stamina", "STA", `${unit.stamina}/${unit.staminaMax}`, {
        isCorrupted: unit.corruptedStat === "stamina"
      })}
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

function renderUnitSummary(unit, { showExperience = false, showLoadout = true } = {}) {
  const attachedGear = unit.gear ?? null;

  return `
    <div class="selection-section selection-section--unit" data-selection-unit-card="${unit.id ?? ""}">
      <div class="selection-unit-heading">
      <div class="selection-unit-heading__title">
        <strong>${unit.name}</strong>
        <span class="selection-level-badge" aria-label="Level ${unit.level}">${unit.level}</span>
        ${
          unit.isBurned
            ? `
                <img
                  class="selection-unit-heading__condition-icon"
                  src="${BURN_ICON_URL}"
                  alt="Burning"
                  loading="lazy"
                  decoding="async"
                />
              `
              : ""
          }
        </div>
      </div>
      ${showExperience ? renderExperienceBar(unit) : ""}
      ${renderHealthBar(unit)}
      ${renderUnitStatGrid(unit)}
      ${showLoadout ? renderProfileSummary(unit) : ""}
      ${
        attachedGear
          ? `
            <div class="selection-header">
              <strong>Gear</strong>
              <span>${attachedGear.name}</span>
            </div>
            ${(attachedGear.detailLines ?? []).map((line) => `<p>${line}</p>`).join("")}
            ${
              Number.isFinite(attachedGear.ammo)
                ? `<p><strong>AA Ammo:</strong> ${attachedGear.ammo}</p>`
                : ""
            }
          `
          : ""
      }
    </div>
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

function formatGridPosition(tile) {
  if (!tile || !Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
    return "Unknown";
  }

  return `Sector ${String.fromCharCode(65 + tile.y)}${tile.x + 1}`;
}

function getUnitEffectSummary(unit) {
  const effects = [];

  if (unit?.isBurned) {
    effects.push("Burn");
  }

  if (unit?.corruptedStat) {
    effects.push("Corrupted");
  }

  if (unit?.isSlowed) {
    effects.push("Slowed");
  }

  return effects.length > 0 ? effects.join(", ") : "None";
}

function renderTargetIntelCard(tile, { forecast = null } = {}) {
  if (!tile?.unit) {
    return "";
  }

  const unit = tile.unit;
  const armorName = unit?.armorClass ? formatProfileName(unit.armorClass) : "Unknown";
  const rows = [
    ["Armor", armorName],
    ["Position", formatGridPosition(tile)],
    ["Terrain", tile.terrain?.label ?? "Unknown"],
    ["Effect", getUnitEffectSummary(unit)]
  ];

  if (forecast) {
    const counterLabel = forecast.received ? `${forecast.received.min}-${forecast.received.max}` : "0";
    rows.push(["Forecast", `${forecast.dealt.min}-${forecast.dealt.max} | Counter ${counterLabel}`]);
  }

  return `
    <div class="card-block card-block--target-intel">
      <h3>Target Intel</h3>
      <div class="target-intel-card">
        ${renderUnitSummary(unit, { showExperience: false, showLoadout: false })}
        <div class="target-intel-card__rows">
          ${rows
            .map(
              ([label, value]) => `
                <div class="target-intel-card__row">
                  <span>${label}</span>
                  <strong>${value}</strong>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
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
      ${title ? `<h3>${title}</h3>` : ""}
      ${unit ? renderUnitSummary(unit, { showExperience: true }) : ""}
      ${
        building
          ? renderFeatureSection(
              getBuildingIconName(building.type),
              building.name,
              [
                `Owner: ${building.ownerLabel}`,
                `Armor bonus: +${building.armorBonus ?? getBuildingArmorBonusForType(building.type)}`
              ].filter(Boolean)
            )
          : ""
      }
      ${
        building
          ? ""
          : renderFeatureSection(
              getTerrainIconName(selectedTile.terrain.id),
              selectedTile.terrain.label,
              [`Armor bonus: +${selectedTile.terrain.armorBonus ?? 0}`],
              "selection-section--terrain"
            )
      }
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

  if (selectedTile.building) {
    return TURN_SIDES.PLAYER;
  }

  return TURN_SIDES.PLAYER;
}

export function getFocusTileForSide(battleSnapshot, battleUi, side) {
  const selectedTile = battleSnapshot.presentation?.selectedTile;
  const selectedTileSide = getSelectedTileFocusSide(battleSnapshot, selectedTile);

  if (selectedTile && selectedTileSide === side) {
    return selectedTile;
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
  const targetTile = buildFocusedTile(battleSnapshot, {
    type: "unit",
    id: target.id
  });

  return renderTargetIntelCard(targetTile, { forecast });
}

export function renderTargetIntelPanel(battleSnapshot, hoveredTile, selectedTile) {
  const hoveredTargetReference = getHoveredTargetReference(battleSnapshot, hoveredTile);

  if (hoveredTargetReference) {
    return renderTargetReference(battleSnapshot, hoveredTile);
  }

  if (selectedTile?.unit?.owner === TURN_SIDES.ENEMY) {
    return renderTargetIntelCard(selectedTile);
  }

  return `
    <div class="card-block">
      <h3>Target Intel</h3>
      <p>Select or target a hostile unit to inspect it here.</p>
    </div>
  `;
}
