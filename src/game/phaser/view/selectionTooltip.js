import { getBuildingTypeMetadata } from "../../content/buildings.js";
import { UNIT_CATALOG } from "../../content/unitCatalog.js";

export function buildForecastTooltipLabel(forecast) {
  if (!forecast) {
    return "";
  }

  const dealtLabel = `${forecast.dealt.min}-${forecast.dealt.max}`;
  const counterLabel = forecast.received ? `${forecast.received.min}-${forecast.received.max}` : "0";
  const nameLine = forecast.targetName ? `${forecast.targetName}\n` : "";

  return `${nameLine}Damage ${dealtLabel}\nCounter ${counterLabel}`;
}

function isVisibleBattlefieldUnit(unit) {
  return Boolean(
    unit &&
      unit.current?.hp > 0 &&
      !unit.transport?.carriedByUnitId
  );
}

function isTileMatch(entity, tile) {
  return Boolean(
    entity &&
      tile &&
      Number.isInteger(tile.x) &&
      Number.isInteger(tile.y) &&
      entity.x === tile.x &&
      entity.y === tile.y
  );
}

export function buildBattlefieldNameTooltip(snapshot, tile) {
  if (!snapshot || !tile) {
    return null;
  }

  const units = [
    ...(snapshot.player?.units ?? []),
    ...(snapshot.enemy?.units ?? [])
  ];
  const unit = units.find(
    (candidate) => isVisibleBattlefieldUnit(candidate) && isTileMatch(candidate, tile)
  );
  const building = (snapshot.map?.buildings ?? []).find((candidate) =>
    isTileMatch(candidate, tile)
  );

  if (!unit && !building) {
    return null;
  }

  if (unit) {
    const unitTypeName = UNIT_CATALOG[unit.unitTypeId]?.name ?? unit.unitTypeId ?? unit.name;
    const unitLabel = unit.name && unit.name !== unitTypeName
      ? `${unit.name} \u2014 ${unitTypeName}`
      : unit.name;
    const secondary = building
      ? {
          type: "building",
          label: getBuildingTypeMetadata(building.type).name,
          owner: building.owner ?? null
        }
      : null;

    return {
      primary: {
        type: "unit",
        label: unitLabel,
        owner: unit.owner ?? null
      },
      secondary
    };
  }

  return {
    primary: {
      type: "building",
      label: getBuildingTypeMetadata(building.type).name,
      owner: building.owner ?? null
    },
    secondary: null
  };
}
