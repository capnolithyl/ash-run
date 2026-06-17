import { BUILDING_KEYS, TURN_SIDES } from "../../game/core/constants.js";
import { getBuildingTypeMetadata } from "../../game/content/buildings.js";
import {
  getMapEditorRunStageOptions,
  getMapEditorThemeOptions,
  getMapEditorTileDetails,
  getMapEditorValidation,
  MAP_EDITOR_MAX_UNIT_LEVEL,
  MAP_EDITOR_MIRROR_MODES,
  MAP_EDITOR_TOOL_IDS
} from "../../game/content/mapEditor.js";
import {
  getBuildingSpriteDefinition,
  getTerrainSpriteDefinition,
  getUnitSpriteDefinition
} from "../../game/phaser/assets.js";
import {
  getMapGoalLabel,
  getMapGoalSummary,
  getMapGoalTargetBuilding,
  MAP_GOAL_ORDER,
  MAP_GOAL_TYPES
} from "../../game/content/mapGoals.js";
import { MAP_THEME_PALETTES, TERRAIN_LIBRARY } from "../../game/content/terrain.js";
import { UNIT_CATALOG } from "../../game/content/unitCatalog.js";
import {
  getReinforcementTriggerLabel,
  isIntervalReinforcementTrigger,
  isOneShotReinforcementTrigger,
  REINFORCEMENT_TRIGGER_ORDER,
  REINFORCEMENT_TRIGGER_TYPES
} from "../../game/content/reinforcements.js";

const MAP_EDITOR_ACCORDION_IDS = {
  TERRAIN: "terrain",
  BUILDINGS: "buildings",
  UNITS: "units",
  REINFORCEMENTS: "reinforcements",
  MIRROR: "mirror"
};

const TERRAIN_PREVIEW_KEYS = {
  plain: ".",
  road: "=",
  forest: "F",
  mountain: "^",
  water: "~",
  ridge: "#"
};

const MAP_EDITOR_TOOL_TOOLTIPS = {
  [MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER]: "Reset only the terrain on a tile back to plains.",
  [MAP_EDITOR_TOOL_IDS.BUILDING_ERASER]: "Remove only the building on a tile.",
  [MAP_EDITOR_TOOL_IDS.UNIT_ERASER]: "Remove only the starting unit on a tile.",
  [MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT_ERASER]: "Remove a unit from the selected reinforcement wave.",
  [MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER_ERASER]: "Remove a trigger tile from the selected reinforcement wave."
};

const MAP_EDITOR_MIRROR_DESCRIPTIONS = {
  [MAP_EDITOR_MIRROR_MODES.OFF]: "Paint only the tile under the cursor.",
  [MAP_EDITOR_MIRROR_MODES.VERTICAL]: "Mirror edits left to right across the map center.",
  [MAP_EDITOR_MIRROR_MODES.HORIZONTAL]: "Mirror edits top to bottom across the map center.",
  [MAP_EDITOR_MIRROR_MODES.DIAGONAL]: "Mirror edits across the top-left to bottom-right diagonal."
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function sanitizeCssIdentifier(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "map-editor-preview";
}

function getAnimationRangeFrameIndices(animationSpec, rangeName = "default") {
  const range = animationSpec?.ranges?.[rangeName] ?? animationSpec?.ranges?.default ?? null;

  if (!range) {
    return [];
  }

  return Array.from(
    { length: Math.max(0, range.end - range.start + 1) },
    (_, index) => range.start + index
  );
}

function getSpriteSheetAxisPosition(frameIndexOnAxis, totalFramesOnAxis) {
  if (!Number.isFinite(totalFramesOnAxis) || totalFramesOnAxis <= 1) {
    return "0%";
  }

  return `${((frameIndexOnAxis / (totalFramesOnAxis - 1)) * 100).toFixed(4)}%`;
}

function getSpriteSheetFramePosition(frameIndex, columns, rows) {
  const resolvedColumns = Math.max(1, columns);
  const resolvedRows = Math.max(1, rows);
  const column = Math.max(0, frameIndex % resolvedColumns);
  const row = Math.max(0, Math.floor(frameIndex / resolvedColumns));

  return {
    x: getSpriteSheetAxisPosition(column, resolvedColumns),
    y: getSpriteSheetAxisPosition(Math.min(row, resolvedRows - 1), resolvedRows)
  };
}

function buildPreviewKeyframes(previewId, animationId, frameIndices, columns, rows) {
  if (frameIndices.length <= 1) {
    return { animationName: "", css: "" };
  }

  const animationName = [
    "map-editor-preview",
    sanitizeCssIdentifier(previewId),
    sanitizeCssIdentifier(animationId),
    `${frameIndices[0]}-${frameIndices[frameIndices.length - 1]}`,
    `${columns}x${rows}`
  ].join("-");

  const steps = frameIndices.map((frameIndex, index) => {
    const position = getSpriteSheetFramePosition(frameIndex, columns, rows);
    const percent = ((index / frameIndices.length) * 100).toFixed(4);
    return `  ${percent}% { background-position: ${position.x} ${position.y}; }`;
  });
  const startPosition = getSpriteSheetFramePosition(frameIndices[0], columns, rows);
  steps.push(`  100% { background-position: ${startPosition.x} ${startPosition.y}; }`);

  return {
    animationName,
    css: `@keyframes ${animationName} {\n${steps.join("\n")}\n}`
  };
}

function renderSheetPreview({
  previewId,
  animationId,
  url,
  frameIndices,
  columns,
  rows,
  frameRate,
  previewStyles
}) {
  if (!url || frameIndices.length === 0) {
    return "";
  }

  const { animationName, css } = buildPreviewKeyframes(
    previewId,
    animationId,
    frameIndices,
    columns,
    rows
  );
  const durationSeconds = Math.max(
    frameIndices.length / Math.max(frameRate ?? 1, 1),
    0.45
  ).toFixed(2);
  const startPosition = getSpriteSheetFramePosition(frameIndices[0], columns, rows);

  if (css && animationName) {
    previewStyles.set(animationName, css);
  }

  return `
    <span class="map-editor-tool__preview-image map-editor-tool__preview-image--sheet" aria-hidden="true">
      <span
        class="map-editor-tool__preview-sheet-surface"
        style="
          --preview-columns:${columns};
          --preview-rows:${rows};
          --sheet-duration:${durationSeconds}s;
          --preview-start-x:${startPosition.x};
          --preview-start-y:${startPosition.y};
          background-image:url('${escapeAttribute(url)}');
          ${animationName ? `animation-name:${animationName};` : ""}
        "
      ></span>
    </span>
  `;
}

function renderStaticPreview(url, label) {
  if (!url) {
    return `<span class="map-editor-tool__preview-fallback" aria-hidden="true">${escapeHtml(label).slice(0, 2).toUpperCase()}</span>`;
  }

  return `
    <img
      class="map-editor-tool__preview-image"
      src="${escapeAttribute(url)}"
      alt=""
      loading="lazy"
      decoding="async"
      aria-hidden="true"
    />
  `;
}

function renderTerrainPreview(terrainId, terrain, previewStyles) {
  const spriteDefinition = getTerrainSpriteDefinition(terrainId);
  const animated = spriteDefinition?.animated ?? null;
  const frameCount = Number(animated?.frameCount ?? 0);
  const frameIndices = frameCount > 0
    ? Array.from({ length: frameCount }, (_, index) => index)
    : [];

  if (animated?.url && frameIndices.length > 1) {
    return renderSheetPreview({
      previewId: `terrain-${terrainId}`,
      animationId: "default",
      url: animated.url,
      frameIndices,
      columns: Math.max(1, animated.sheetColumns ?? frameIndices.length),
      rows: Math.max(1, animated.sheetRows ?? 1),
      frameRate: animated.frameRate,
      previewStyles
    });
  }

  return renderStaticPreview(spriteDefinition?.fallbackUrl ?? spriteDefinition?.url, terrain?.label ?? terrainId);
}

function renderBuildingPreview(buildingType, owner) {
  const spriteDefinition = getBuildingSpriteDefinition(buildingType, owner);
  const label = getBuildingTypeMetadata(buildingType).shortLabel;
  return renderStaticPreview(spriteDefinition?.url, label);
}

function renderUnitPreview(unitTypeId, owner, unitName, previewStyles, colorOptions = {}) {
  const spriteDefinition = getUnitSpriteDefinition(unitTypeId, owner, colorOptions);
  const idleAnimation = spriteDefinition?.idle ?? null;
  const frameIndices = getAnimationRangeFrameIndices(idleAnimation, "default");

  if (idleAnimation?.url && frameIndices.length > 0) {
    return renderSheetPreview({
      previewId: `unit-${unitTypeId}-${owner}`,
      animationId: "idle",
      url: idleAnimation.url,
      frameIndices,
      columns: Math.max(1, idleAnimation.sheetColumns ?? frameIndices.length),
      rows: Math.max(1, idleAnimation.sheetRows ?? 1),
      frameRate: idleAnimation.frameRate,
      previewStyles
    });
  }

  return renderStaticPreview(spriteDefinition?.fallbackUrl ?? spriteDefinition?.url, unitName);
}

function renderAccordion(sectionId, title, subtitle, content, openAccordion) {
  const isOpen = openAccordion === sectionId;

  return `
    <details
      class="debug-section"
      data-map-editor-accordion="${sectionId}"
      name="map-editor-accordion"
      ${isOpen ? "open" : ""}
    >
      <summary data-map-editor-accordion-summary="${sectionId}">
        <span>
          <strong>${title}</strong>
          <small>${subtitle}</small>
        </span>
      </summary>
      <div class="map-editor-accordion__content">
        <div class="map-editor-accordion__inner">
          ${content}
        </div>
      </div>
    </details>
  `;
}

function renderTooltipAttributes(tooltip) {
  return tooltip ? ` data-tooltip="${escapeAttribute(tooltip)}"` : "";
}

function renderTerrainTools(state, previewStyles) {
  return Object.entries(TERRAIN_LIBRARY)
    .map(([terrainId, terrain]) => {
      const isActive =
        state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.TERRAIN &&
        state.mapEditor.selectedTerrainId === terrainId;

      return `
        <button
          class="ghost-button ghost-button--small map-editor-tool ${isActive ? "map-editor-tool--active" : ""}"
          data-action="map-editor-select-terrain"
          data-terrain-id="${terrainId}"
          type="button"
        >
          <span class="map-editor-tool__swatch map-editor-tool__swatch--preview map-editor-tool__swatch--terrain" style="--swatch:${terrain.color};">
            ${renderTerrainPreview(terrainId, terrain, previewStyles)}
          </span>
          <span class="map-editor-tool__copy">
            <strong>${terrain.label}</strong>
            <small>${terrainId}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderBuildingTools(state) {
  return Object.values(BUILDING_KEYS)
    .map((buildingType) => {
      const metadata = getBuildingTypeMetadata(buildingType);
      const isActive =
        state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.BUILDING &&
        state.mapEditor.selectedBuildingType === buildingType;

      return `
        <button
          class="ghost-button ghost-button--small map-editor-tool map-editor-has-tooltip ${isActive ? "map-editor-tool--active" : ""}"
          data-action="map-editor-select-building"
          data-building-type="${buildingType}"
          ${renderTooltipAttributes(metadata.summary)}
          type="button"
        >
          <span class="map-editor-tool__swatch map-editor-tool__swatch--preview map-editor-tool__swatch--building">
            ${renderBuildingPreview(buildingType, state.mapEditor.selectedBuildingOwner)}
          </span>
          <span class="map-editor-tool__copy">
            <strong>${metadata.name}</strong>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderUnitTools(state, previewStyles, options = {}) {
  const action = options.action ?? "map-editor-select-unit";
  const activeTool = options.activeTool ?? MAP_EDITOR_TOOL_IDS.UNIT;
  const owner = options.owner ?? state.mapEditor.selectedUnitOwner;

  return Object.values(UNIT_CATALOG)
    .map((unit) => {
      const isActive =
        state.mapEditor.selectedTool === activeTool &&
        state.mapEditor.selectedUnitTypeId === unit.id;
      const tooltip = `${unit.family} unit. Range ${unit.minRange}-${unit.maxRange}. Move ${unit.movement}.`;

      return `
        <button
          class="ghost-button ghost-button--small map-editor-tool map-editor-tool--unit map-editor-has-tooltip ${isActive ? "map-editor-tool--active" : ""}"
          data-action="${action}"
          data-unit-type-id="${unit.id}"
          ${renderTooltipAttributes(tooltip)}
          type="button"
        >
          <span class="map-editor-tool__swatch map-editor-tool__swatch--preview map-editor-tool__swatch--unit">
            ${renderUnitPreview(
              unit.id,
              owner,
              unit.name,
              previewStyles,
              state.metaState?.options
            )}
          </span>
          <span class="map-editor-tool__copy">
            <strong>${unit.name}</strong>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderSelectiveEraserTool(state, toolId, label) {
  const isActive = state.mapEditor.selectedTool === toolId;

  return `
    <button
      class="ghost-button ghost-button--small map-editor-tool map-editor-has-tooltip ${isActive ? "map-editor-tool--active" : ""}"
      data-action="map-editor-select-tool"
      data-map-editor-tool="${toolId}"
      ${renderTooltipAttributes(MAP_EDITOR_TOOL_TOOLTIPS[toolId])}
      type="button"
    >
      <span class="map-editor-tool__swatch map-editor-tool__swatch--marker">${label.charAt(0)}</span>
      <span class="map-editor-tool__copy">
        <strong>${label}</strong>
      </span>
    </button>
  `;
}

function renderOwnerButtons(selectedOwner, action, dataAttribute, owners) {
  return owners
    .map((owner) => `
      <button
        class="ghost-button ghost-button--small map-editor-chip map-editor-chip--${owner} ${selectedOwner === owner ? "map-editor-chip--active" : ""}"
        data-action="${action}"
        ${dataAttribute}="${owner}"
        type="button"
      >
        ${owner}
      </button>
    `)
    .join("");
}

function renderMirrorButtons(state) {
  return Object.values(MAP_EDITOR_MIRROR_MODES)
    .map((mirrorMode) => {
      const isActive = state.mapEditor.mirrorMode === mirrorMode;
      const label = mirrorMode === MAP_EDITOR_MIRROR_MODES.OFF
        ? "Off"
        : mirrorMode.charAt(0).toUpperCase() + mirrorMode.slice(1);
      return `
        <button
          class="ghost-button ghost-button--small map-editor-mirror map-editor-has-tooltip ${isActive ? "map-editor-mirror--active" : ""}"
          data-action="map-editor-set-mirror-mode"
          data-mirror-mode="${mirrorMode}"
          ${renderTooltipAttributes(MAP_EDITOR_MIRROR_DESCRIPTIONS[mirrorMode])}
          type="button"
        >
          <strong>${label}</strong>
        </button>
      `;
    })
    .join("");
}

function renderQuickSelectButton({
  active = false,
  disabled = false,
  action,
  previewMarkup,
  title,
  detail = "",
  tooltip = "",
  compact = false,
  extraAttributes = ""
}) {
  const accessibleLabel = detail ? `${title}: ${detail}` : title;
  return `
    <button
      class="ghost-button ghost-button--small map-editor-tool map-editor-has-tooltip ${compact ? "map-editor-tool--compact" : ""} ${active ? "map-editor-tool--active" : ""}"
      data-action="${action}"
      ${renderTooltipAttributes(tooltip)}
      ${extraAttributes}
      type="button"
      aria-label="${escapeAttribute(accessibleLabel)}"
      ${disabled ? "disabled" : ""}
    >
      <span class="map-editor-tool__swatch map-editor-tool__swatch--preview">
        ${previewMarkup}
      </span>
      ${
        compact
          ? ""
          : `
            <span class="map-editor-tool__copy">
              <strong>${title}</strong>
              ${detail ? `<small>${detail}</small>` : ""}
            </span>
          `
      }
    </button>
  `;
}

function renderQuickSelectMarker(content) {
  return `<span class="map-editor-tool__preview-fallback map-editor-tool__preview-fallback--marker" aria-hidden="true">${content}</span>`;
}

function renderQuickSelectSection(state, previewStyles) {
  const lastTerrainId = state.mapEditor.lastSelectedTerrainId;
  const lastTerrain = lastTerrainId ? TERRAIN_LIBRARY[lastTerrainId] : null;
  const lastBuilding = state.mapEditor.lastSelectedBuilding;
  const lastBuildingMetadata = lastBuilding ? getBuildingTypeMetadata(lastBuilding.type) : null;
  const lastUnit = state.mapEditor.lastSelectedUnit;
  const lastUnitMetadata = lastUnit ? UNIT_CATALOG[lastUnit.unitTypeId] : null;

  return `
    <div class="card-block map-editor-quick-selects">
      <p class="eyebrow">Quick Select</p>
      <div class="map-editor-tool-grid map-editor-tool-grid--quick">
        ${renderQuickSelectButton({
          active:
            state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.TERRAIN &&
            Boolean(lastTerrainId) &&
            state.mapEditor.selectedTerrainId === lastTerrainId,
          disabled: !lastTerrain,
          action: "map-editor-restore-last-terrain",
          previewMarkup: lastTerrain
            ? renderTerrainPreview(lastTerrainId, lastTerrain, previewStyles)
            : `<span class="map-editor-tool__preview-fallback" aria-hidden="true">--</span>`,
          title: "Last Terrain",
          detail: lastTerrain?.label ?? "Not set yet",
          tooltip: lastTerrain ? `Paint ${lastTerrain.label} again.` : "Choose a terrain to store it here.",
          compact: true
        })}
        ${renderQuickSelectButton({
          active:
            state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.BUILDING &&
            Boolean(lastBuilding) &&
            state.mapEditor.selectedBuildingType === lastBuilding?.type &&
            state.mapEditor.selectedBuildingOwner === lastBuilding?.owner,
          disabled: !lastBuildingMetadata,
          action: "map-editor-restore-last-building",
          previewMarkup: lastBuildingMetadata
            ? renderBuildingPreview(lastBuilding.type, lastBuilding.owner)
            : `<span class="map-editor-tool__preview-fallback" aria-hidden="true">--</span>`,
          title: "Last Building",
          detail: lastBuildingMetadata ? `${lastBuildingMetadata.name} (${lastBuilding.owner})` : "Not set yet",
          tooltip: lastBuildingMetadata ? lastBuildingMetadata.summary : "Choose a building to store it here.",
          compact: true
        })}
        ${renderQuickSelectButton({
          active:
            state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.UNIT &&
            Boolean(lastUnit) &&
            state.mapEditor.selectedUnitTypeId === lastUnit?.unitTypeId &&
            state.mapEditor.selectedUnitOwner === lastUnit?.owner &&
            Number(state.mapEditor.selectedUnitLevel ?? 1) === Number(lastUnit?.level ?? 1),
          disabled: !lastUnitMetadata,
          action: "map-editor-restore-last-unit",
          previewMarkup: lastUnitMetadata
            ? renderUnitPreview(
                lastUnit.unitTypeId,
                lastUnit.owner,
                lastUnitMetadata.name,
                previewStyles,
                state.metaState?.options
              )
            : `<span class="map-editor-tool__preview-fallback" aria-hidden="true">--</span>`,
          title: "Last Unit",
          detail: lastUnitMetadata ? `${lastUnitMetadata.name} L${lastUnit.level} (${lastUnit.owner})` : "Not set yet",
          tooltip: lastUnitMetadata
            ? `${lastUnitMetadata.family} unit. Range ${lastUnitMetadata.minRange}-${lastUnitMetadata.maxRange}. Move ${lastUnitMetadata.movement}.`
            : "Choose a unit to store it here.",
          compact: true
        })}
        ${renderQuickSelectButton({
          active: state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER,
          action: "map-editor-select-tool",
          previewMarkup: renderQuickSelectMarker("T"),
          title: "Terrain Eraser",
          detail: "Terrain only",
          tooltip: MAP_EDITOR_TOOL_TOOLTIPS[MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER],
          compact: true,
          extraAttributes: `data-map-editor-tool="${MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER}"`
        })}
        ${renderQuickSelectButton({
          active: state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.BUILDING_ERASER,
          action: "map-editor-select-tool",
          previewMarkup: renderQuickSelectMarker("B"),
          title: "Building Eraser",
          detail: "Building only",
          tooltip: MAP_EDITOR_TOOL_TOOLTIPS[MAP_EDITOR_TOOL_IDS.BUILDING_ERASER],
          compact: true,
          extraAttributes: `data-map-editor-tool="${MAP_EDITOR_TOOL_IDS.BUILDING_ERASER}"`
        })}
        ${renderQuickSelectButton({
          active: state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.UNIT_ERASER,
          action: "map-editor-select-tool",
          previewMarkup: renderQuickSelectMarker("U"),
          title: "Unit Eraser",
          detail: "Unit only",
          tooltip: MAP_EDITOR_TOOL_TOOLTIPS[MAP_EDITOR_TOOL_IDS.UNIT_ERASER],
          compact: true,
          extraAttributes: `data-map-editor-tool="${MAP_EDITOR_TOOL_IDS.UNIT_ERASER}"`
        })}
      </div>
    </div>
  `;
}

function renderCleanupTools(state) {
  return [
    renderSelectiveEraserTool(state, MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER, "Terrain Eraser"),
    renderSelectiveEraserTool(state, MAP_EDITOR_TOOL_IDS.BUILDING_ERASER, "Building Eraser"),
    renderSelectiveEraserTool(state, MAP_EDITOR_TOOL_IDS.UNIT_ERASER, "Unit Eraser")
  ].join("");
}

function renderActiveTool(state) {
  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.BUILDING) {
    const metadata = getBuildingTypeMetadata(state.mapEditor.selectedBuildingType);
    return `${metadata.name} (${state.mapEditor.selectedBuildingOwner})`;
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.UNIT) {
    const unit = UNIT_CATALOG[state.mapEditor.selectedUnitTypeId];
    return `${unit?.name ?? "Unit"} L${state.mapEditor.selectedUnitLevel ?? 1} (${state.mapEditor.selectedUnitOwner})`;
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT) {
    const unit = UNIT_CATALOG[state.mapEditor.selectedUnitTypeId];
    return `${unit?.name ?? "Unit"} L${state.mapEditor.selectedUnitLevel ?? 1} reinforcement`;
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER) {
    return "Reinforcement Trigger Tile";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.TERRAIN) {
    return TERRAIN_LIBRARY[state.mapEditor.selectedTerrainId]?.label ?? "Terrain";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER) {
    return "Terrain Eraser";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.BUILDING_ERASER) {
    return "Building Eraser";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.UNIT_ERASER) {
    return "Unit Eraser";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT_ERASER) {
    return "Reinforcement Eraser";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER_ERASER) {
    return "Trigger Eraser";
  }

  return "Tool";
}

function renderCompactTool(state) {
  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.BUILDING) {
    return getBuildingTypeMetadata(state.mapEditor.selectedBuildingType).name;
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.UNIT) {
    const unitName = UNIT_CATALOG[state.mapEditor.selectedUnitTypeId]?.name ?? "Unit";
    return `${unitName} L${state.mapEditor.selectedUnitLevel ?? 1}`;
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT) {
    const unitName = UNIT_CATALOG[state.mapEditor.selectedUnitTypeId]?.name ?? "Unit";
    return `${unitName} Reinforcement`;
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER) {
    return "Trigger Tile";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.TERRAIN) {
    return TERRAIN_LIBRARY[state.mapEditor.selectedTerrainId]?.label ?? "Terrain";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.TERRAIN_ERASER) {
    return "Terrain Eraser";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.BUILDING_ERASER) {
    return "Building Eraser";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.UNIT_ERASER) {
    return "Unit Eraser";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT_ERASER) {
    return "Reinforcement Eraser";
  }

  if (state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER_ERASER) {
    return "Trigger Eraser";
  }

  return "Tool";
}

function renderMirrorLabel(mirrorMode) {
  if (!mirrorMode) {
    return "Off";
  }

  return mirrorMode.charAt(0).toUpperCase() + mirrorMode.slice(1);
}

function getMapLoadVariantLabel(entry) {
  const variantStage = Number(entry?.variantStage);

  if (Number.isInteger(variantStage) && variantStage > 0) {
    return `Stage ${variantStage}`;
  }

  return "Stage 1";
}

function getMapLoadGroupKey(entry) {
  return String(entry?.name ?? entry?.id ?? entry?.fileName ?? "Untitled Map");
}

function groupMapLoadEntries(entries) {
  const groups = new Map();

  for (const entry of entries) {
    const groupKey = getMapLoadGroupKey(entry);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }

    groups.get(groupKey).push(entry);
  }

  return [...groups.entries()].map(([groupKey, groupEntries]) => ({
    key: groupKey,
    title: groupKey,
    entries: groupEntries.sort((left, right) => {
      const leftStage = Number(left.variantStage ?? 1);
      const rightStage = Number(right.variantStage ?? 1);
      const byStage = leftStage - rightStage;

      return byStage !== 0
        ? byStage
        : String(left.relativePath ?? "").localeCompare(String(right.relativePath ?? ""));
    })
  }));
}

function getBuildingPreviewOwner(building) {
  if (building?.owner === "player") {
    return "player";
  }

  if (building?.owner === "enemy") {
    return "enemy";
  }

  if (building?.owner === "neutral") {
    return "neutral";
  }

  return null;
}

function renderMapLoadPreview(mapDefinition) {
  if (!mapDefinition?.width || !mapDefinition?.height || !Array.isArray(mapDefinition?.tiles)) {
    return "";
  }

  const buildingLookup = new Map(
    (mapDefinition.buildings ?? []).map((building) => [`${building.x},${building.y}`, building])
  );

  const tiles = mapDefinition.tiles
    .map((row, y) =>
      row
        .map((tileKey, x) => {
          const building = buildingLookup.get(`${x},${y}`);
          const owner = getBuildingPreviewOwner(building);
          const terrainKey = TERRAIN_PREVIEW_KEYS[tileKey] ? tileKey : "plain";
          const marker = owner ? owner[0].toUpperCase() : TERRAIN_PREVIEW_KEYS[tileKey] ?? ".";

          return `
            <span
              class="map-editor-load-preview__tile map-editor-load-preview__tile--${terrainKey} ${owner ? `map-editor-load-preview__tile--${owner}` : ""}"
              aria-label="${owner ? `${owner} building` : tileKey}"
            >${marker}</span>
          `;
        })
        .join("")
    )
    .join("");

  return `
    <div
      class="map-editor-load-preview__grid"
      style="--map-columns:${mapDefinition.width}; --map-rows:${mapDefinition.height};"
      role="img"
      aria-label="Map layout preview"
    >
      ${tiles}
    </div>
  `;
}

function renderMapLoadDialog(state) {
  if (!state.mapEditor.loadDialogOpen) {
    return "";
  }

  const entries = state.mapEditor.loadDialogEntries ?? [];
  const entryGroups = groupMapLoadEntries(entries);
  const selectedEntry = entries.find(
    (entry) => entry.relativePath === state.mapEditor.loadDialogSelectedPath
  ) ?? entries[0] ?? null;
  const selectedGroupKey = selectedEntry ? getMapLoadGroupKey(selectedEntry) : null;
  const isBusy = state.mapEditor.loadDialogBusy === true;
  const errorText = state.mapEditor.loadDialogError ?? "";
  const selectedMapPreview = selectedEntry?.previewMap ?? null;
  const selectedGoal = selectedEntry?.goal ?? selectedMapPreview?.goal ?? { type: MAP_GOAL_TYPES.ROUT };
  const goalSummary = selectedEntry
    ? getMapGoalSummary(selectedGoal, {
        width: selectedEntry.width ?? selectedMapPreview?.width ?? 0,
        height: selectedEntry.height ?? selectedMapPreview?.height ?? 0,
        goal: selectedGoal,
        buildings: selectedMapPreview?.buildings ?? []
      })
    : "Choose a map from the game folder to load it into the editor.";

  return `
    <div class="battle-overlay battle-overlay--pause map-editor-load-overlay">
      <div class="overlay-card overlay-card--pause map-editor-load-dialog">
        <div class="map-editor-load-dialog__header">
          <div>
            <p class="eyebrow">Game Map Folder</p>
            <h2>Load Map</h2>
            <p>Pick a map from the game folder and load it straight into the editor.</p>
          </div>
          <button
            class="ghost-button ghost-button--small"
            data-action="map-editor-close-load-dialog"
            type="button"
            ${isBusy ? "disabled" : ""}
          >
            Cancel
          </button>
        </div>
        <div class="map-editor-load-dialog__body">
          <div
            class="map-editor-load-dialog__list"
            data-map-editor-load-list="true"
            aria-label="Map files"
          >
            ${
              entries.length > 0
                ? entryGroups.map((group) => {
                  const shouldOpen =
                    state.mapEditor.loadDialogOpenGroupKey
                      ? state.mapEditor.loadDialogOpenGroupKey === group.key
                      : group.key === selectedGroupKey;

                  return `
                    <details
                      class="map-editor-load-group"
                      data-map-editor-load-group="${escapeAttribute(group.key)}"
                      name="map-editor-load-group"
                      ${shouldOpen ? "open" : ""}
                    >
                      <summary class="map-editor-load-group__summary">
                        <span>
                          <strong>${escapeHtml(group.title)}</strong>
                          <small>${group.entries.length} variant${group.entries.length === 1 ? "" : "s"}</small>
                        </span>
                      </summary>
                      <div class="map-editor-load-group__content" role="listbox" aria-label="${escapeAttribute(group.title)} variants">
                        ${group.entries.map((entry) => {
                          const isSelected = entry.relativePath === selectedEntry?.relativePath;
                          return `
                            <button
                              class="map-editor-load-entry ${isSelected ? "map-editor-load-entry--active" : ""}"
                              data-action="map-editor-select-load-entry"
                              data-map-relative-path="${escapeAttribute(entry.relativePath)}"
                              role="option"
                              aria-selected="${isSelected ? "true" : "false"}"
                              type="button"
                              ${isBusy ? "disabled" : ""}
                            >
                              <strong>${getMapLoadVariantLabel(entry)}</strong>
                              <span>${entry.width}x${entry.height}</span>
                              <small>${escapeHtml(entry.relativePath)}</small>
                            </button>
                          `;
                        }).join("")}
                      </div>
                    </details>
                  `;
                }).join("")
                : `<p class="map-editor-load-dialog__empty">${escapeHtml(errorText || "No map files were found in the game map folder.")}</p>`
            }
          </div>
          <div class="map-editor-load-dialog__preview">
            ${
              selectedEntry
                ? `
                  <p class="eyebrow">Preview</p>
                  <h3>${escapeHtml(selectedEntry.name)}</h3>
                  <p><strong>${getMapLoadVariantLabel(selectedEntry)}</strong> ${escapeHtml(selectedEntry.relativePath)}</p>
                  <p><strong>${getMapGoalLabel(selectedGoal)}</strong> ${goalSummary}</p>
                  ${renderMapLoadPreview(selectedMapPreview)}
                `
                : `
                  <p class="eyebrow">Preview</p>
                  <p class="map-editor-load-dialog__empty">${escapeHtml(errorText || "No map is selected.")}</p>
                `
            }
            ${errorText && entries.length > 0 ? `<p class="map-editor-load-dialog__error">${escapeHtml(errorText)}</p>` : ""}
          </div>
        </div>
        <div class="map-editor-load-dialog__actions">
          <button
            class="ghost-button ghost-button--small"
            data-action="map-editor-close-load-dialog"
            type="button"
            ${isBusy ? "disabled" : ""}
          >
            Cancel
          </button>
          <button
            class="menu-button menu-button--small"
            data-action="map-editor-confirm-load"
            type="button"
            ${selectedEntry && !isBusy ? "" : "disabled"}
          >
            ${isBusy ? "Loading..." : "Load Selected Map"}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderTopCardStat(label, value) {
  return `
    <div class="map-editor-topcard__stat">
      <dt>${label}</dt>
      <dd>${value}</dd>
    </div>
  `;
}

function renderTopCard({
  side,
  eyebrow,
  title,
  summary,
  stats,
  actions = ""
}) {
  return `
    <section class="commander-panel-shell commander-panel-shell--${side} map-editor-topcard-shell">
      <div class="commander-panel commander-panel--${side} map-editor-topcard map-editor-topcard--${side}">
        <div class="map-editor-topcard__body">
          <div class="map-editor-topcard__headline">
            <p class="map-editor-topcard__eyebrow">${eyebrow}</p>
            <h2 class="map-editor-topcard__title" ${side === "player" ? 'data-map-editor-live-name="true"' : ""}>${title}</h2>
            <p class="map-editor-topcard__summary">${summary}</p>
          </div>
          ${
            stats.length
              ? `
                <dl class="map-editor-topcard__stats">
                  ${stats.map(({ label, value }) => renderTopCardStat(label, value)).join("")}
                </dl>
              `
              : ""
          }
          ${actions}
        </div>
      </div>
    </section>
  `;
}

function renderTopPanels(map, validation) {
  const validationHeadline = validation.isValid ? "Ready To Save" : "Needs Attention";
  const validationSummary = validation.isValid
    ? "The map passes validation and can be saved right now."
    : validation.errors[0] ?? "Resolve the remaining validation issues before saving.";

  return `
    <div class="battle-commanders map-editor-commanders" aria-label="Map editor overview">
      ${renderTopCard({
        side: "player",
        eyebrow: "Map Editor",
        title: map.name || "Untitled Map",
        summary: getMapGoalSummary(map.goal, map),
        stats: []
      })}
      ${renderTopCard({
        side: "enemy",
        eyebrow: "Editor Status",
        title: validationHeadline,
        summary: validationSummary,
        stats: [],
        actions: `
          <div class="map-editor-topcard__actions">
            <button
              class="ghost-button ghost-button--small"
              data-action="map-editor-import"
              type="button"
            >
              Load Map
            </button>
            <button
              class="menu-button menu-button--small"
              data-action="map-editor-export"
              type="button"
              ${validation.isValid ? "" : "disabled"}
            >
              Save Map
            </button>
          </div>
        `
      })}
    </div>
  `;
}

function renderTileSummary(tileDetails) {
  if (!tileDetails) {
    return `
      <div class="card-block">
        <p class="eyebrow">Selected Tile</p>
        <p>Select a tile on the battlefield to inspect its terrain, building, and placed unit.</p>
      </div>
    `;
  }

  return `
    <div class="card-block map-editor-tile-card">
      <p class="eyebrow">Selected Tile</p>
      <h3>Tile ${tileDetails.x}, ${tileDetails.y}</h3>
      <p>${tileDetails.terrain?.label ?? "Unknown Terrain"}</p>
      <p>${tileDetails.buildingMetadata ? `${tileDetails.buildingMetadata.name} (${tileDetails.building.owner})` : "No building"}</p>
      <p>${tileDetails.unitMetadata ? `${tileDetails.unitMetadata.name} (${tileDetails.unit.owner}) L${tileDetails.unit.level ?? 1}` : "No unit"}</p>
      ${
        tileDetails.reinforcementUnits.length > 0
          ? `<p>${tileDetails.reinforcementUnits.map((unit) =>
              `${escapeHtml(unit.waveName)}: ${escapeHtml(UNIT_CATALOG[unit.unitTypeId]?.name ?? unit.unitTypeId)} L${unit.level}`
            ).join("<br />")}</p>`
          : "<p>No reinforcements</p>"
      }
      ${
        tileDetails.reinforcementTriggerWaveIds.length > 0
          ? `<p>Trigger tile for ${tileDetails.reinforcementTriggerWaveIds.map(escapeHtml).join(", ")}</p>`
          : ""
      }
      ${
        tileDetails.unit
          ? `
            <div class="debug-grid">
              <label>
                <span>Unit Level</span>
                <input
                  type="number"
                  data-map-editor-field="selectedTileUnitLevel"
                  value="${tileDetails.unit.level ?? 1}"
                  min="1"
                  max="${MAP_EDITOR_MAX_UNIT_LEVEL}"
                />
              </label>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderRunSetupSection(map, mapStages = {}) {
  const variantStage = Number(map.variantStage) || 1;
  const authoredStages = new Set(
    Object.keys(mapStages ?? {})
      .map((stage) => Number(stage))
      .filter((stage) => Number.isInteger(stage) && stage > 0)
  );
  authoredStages.add(variantStage);

  return `
    <div class="card-block">
      <p class="eyebrow">Run Stages</p>
      <div class="map-editor-owner-row" aria-label="Run stage">
        ${getMapEditorRunStageOptions().map((stage) => `
          <button
            class="ghost-button ghost-button--small map-editor-chip ${variantStage === stage ? "map-editor-chip--active" : ""} ${authoredStages.has(stage) ? "map-editor-chip--authored" : ""}"
            data-action="map-editor-set-variant-stage"
            data-variant-stage="${stage}"
            type="button"
          >
            Stage ${stage}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderHistorySection(state) {
  const historyEntries = state.mapEditor.historyEntries ?? [];
  const currentHistoryIndex = Number(state.mapEditor.currentHistoryIndex ?? -1);
  const pendingHistoryIndex = Number.isInteger(state.mapEditor.pendingHistoryIndex)
    ? state.mapEditor.pendingHistoryIndex
    : null;
  const canUndo = currentHistoryIndex > 0;

  return `
    <div class="card-block">
      <div class="map-editor-history__header">
        <div>
          <p class="eyebrow">History</p>
          <p class="map-editor-history__copy">Undo the latest edit or jump back to an earlier state.</p>
        </div>
        <button
          class="ghost-button ghost-button--small"
          data-action="map-editor-undo"
          type="button"
          ${canUndo ? "" : "disabled"}
        >
          Undo
        </button>
      </div>
      <div class="map-editor-history__list" aria-label="Map edit history">
        ${historyEntries
          .map((entry, index) => {
            const isCurrent = index === currentHistoryIndex;
            const isPending = index === pendingHistoryIndex;

            return `
              <div class="map-editor-history__item${isCurrent ? " map-editor-history__item--current" : ""}${isPending ? " map-editor-history__item--pending" : ""}">
                <button
                  class="ghost-button ghost-button--small map-editor-history__button"
                  data-action="map-editor-request-history-revert"
                  data-history-index="${index}"
                  type="button"
                  ${isCurrent ? "disabled" : ""}
                >
                  <strong>${entry.label}</strong>
                  <small>${isCurrent ? "Current state" : `Step ${index + 1}`}</small>
                </button>
                ${
                  isPending && !isCurrent
                    ? `
                      <div class="map-editor-history__confirm">
                        <p>Go back to this state?</p>
                        <div class="map-editor-inline-actions">
                          <button
                            class="menu-button menu-button--small"
                            data-action="map-editor-confirm-history-revert"
                            type="button"
                          >
                            Confirm
                          </button>
                          <button
                            class="ghost-button ghost-button--small"
                            data-action="map-editor-cancel-history-revert"
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    `
                    : ""
                }
              </div>
            `;
          })
          .reverse()
          .join("")}
      </div>
    </div>
  `;
}

function getSelectedReinforcementWave(state) {
  return (
    state.mapEditor.mapData.reinforcements.find(
      (wave) => wave.id === state.mapEditor.selectedReinforcementWaveId
    ) ?? null
  );
}

function renderReinforcementPalette(state, previewStyles) {
  const wave = getSelectedReinforcementWave(state);

  if (!wave) {
    return `<p>Add a reinforcement wave in the Inspector before placing units.</p>`;
  }

  const canPaintTrigger = wave.trigger.type === REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED;

  return `
    <p><strong>${escapeHtml(wave.name)}</strong></p>
    <div class="debug-grid">
      <label>
        <span>Unit Level</span>
        <input
          type="number"
          data-map-editor-field="selectedUnitLevel"
          value="${state.mapEditor.selectedUnitLevel ?? 1}"
          min="1"
          max="${MAP_EDITOR_MAX_UNIT_LEVEL}"
        />
      </label>
    </div>
    <div class="map-editor-tool-grid map-editor-tool-grid--units" data-map-editor-scroll="reinforcements">
      ${renderUnitTools(state, previewStyles, {
        action: "map-editor-select-reinforcement-unit",
        activeTool: MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT,
        owner: TURN_SIDES.ENEMY
      })}
    </div>
    <div class="map-editor-tool-grid">
      <button
        class="ghost-button ghost-button--small map-editor-tool ${state.mapEditor.selectedTool === MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER ? "map-editor-tool--active" : ""}"
        data-action="map-editor-select-tool"
        data-map-editor-tool="${MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER}"
        type="button"
        ${canPaintTrigger ? "" : "disabled"}
      >
        <span class="map-editor-tool__swatch map-editor-tool__swatch--marker">T</span>
        <span class="map-editor-tool__copy">
          <strong>Trigger Tile</strong>
          <small>${canPaintTrigger ? "Paint crossed tiles" : "Choose Tile Crossed"}</small>
        </span>
      </button>
      ${renderSelectiveEraserTool(
        state,
        MAP_EDITOR_TOOL_IDS.REINFORCEMENT_UNIT_ERASER,
        "Reinforcement Eraser"
      )}
      ${renderSelectiveEraserTool(
        state,
        MAP_EDITOR_TOOL_IDS.REINFORCEMENT_TRIGGER_ERASER,
        "Trigger Eraser"
      )}
    </div>
  `;
}

function renderReinforcementSection(state, tileDetails) {
  const map = state.mapEditor.mapData;
  const wave = getSelectedReinforcementWave(state);
  const selectedEnemy = tileDetails?.unit?.owner === TURN_SIDES.ENEMY
    ? tileDetails.unit
    : null;
  const targetUnit = wave?.trigger?.targetUnitId
    ? map.units.find((unit) => unit.id === wave.trigger.targetUnitId) ?? null
    : null;

  return `
    <div class="card-block map-editor-reinforcements">
      <div class="map-editor-history__header">
        <div>
          <p class="eyebrow">Reinforcements</p>
          <p class="map-editor-history__copy">Author enemy waves and their activation rules.</p>
        </div>
        <button
          class="ghost-button ghost-button--small"
          data-action="map-editor-add-reinforcement-wave"
          type="button"
        >
          Add Wave
        </button>
      </div>
      ${
        map.reinforcements.length > 0
          ? `
            <div class="map-editor-owner-row" aria-label="Reinforcement waves">
              ${map.reinforcements.map((candidate, index) => `
                <button
                  class="ghost-button ghost-button--small map-editor-chip ${candidate.id === wave?.id ? "map-editor-chip--active" : ""}"
                  data-action="map-editor-select-reinforcement-wave"
                  data-reinforcement-wave-id="${candidate.id}"
                  type="button"
                >
                  ${index + 1}. ${escapeHtml(candidate.name)}
                </button>
              `).join("")}
            </div>
          `
          : `<p>No waves authored.</p>`
      }
      ${
        wave
          ? `
            <div class="debug-grid">
              <label>
                <span>Name</span>
                <input
                  type="text"
                  data-map-editor-field="reinforcementName"
                  value="${escapeAttribute(wave.name)}"
                  maxlength="60"
                />
              </label>
              <label>
                <span>Trigger</span>
                <select data-map-editor-field="reinforcementTriggerType">
                  ${REINFORCEMENT_TRIGGER_ORDER.map((triggerType) => `
                    <option value="${triggerType}" ${wave.trigger.type === triggerType ? "selected" : ""}>
                      ${getReinforcementTriggerLabel(triggerType)}
                    </option>
                  `).join("")}
                </select>
              </label>
              ${
                isIntervalReinforcementTrigger(wave.trigger.type)
                  ? `
                    <label>
                      <span>Every</span>
                      <input
                        type="number"
                        data-map-editor-field="reinforcementEvery"
                        value="${wave.trigger.every ?? 1}"
                        min="1"
                        max="99"
                      />
                    </label>
                  `
                  : ""
              }
              ${
                !isOneShotReinforcementTrigger(wave.trigger.type)
                  ? `
                    <label>
                      <span>Activations</span>
                      <input
                        type="number"
                        data-map-editor-field="reinforcementMaxActivations"
                        value="${wave.maxActivations}"
                        min="1"
                        max="99"
                      />
                    </label>
                  `
                  : ""
              }
            </div>
            <p>
              <strong>${wave.units.length}</strong> unit${wave.units.length === 1 ? "" : "s"}
              ${wave.trigger.type === REINFORCEMENT_TRIGGER_TYPES.TILE_CROSSED
                ? ` | <strong>${wave.trigger.tiles.length}</strong> trigger tile${wave.trigger.tiles.length === 1 ? "" : "s"}`
                : ""}
            </p>
            ${
              wave.trigger.type === REINFORCEMENT_TRIGGER_TYPES.UNIT_KILLED
                ? `
                  <p><strong>Target</strong> ${targetUnit ? `${targetUnit.unitTypeId} at ${targetUnit.x}, ${targetUnit.y}` : "No enemy selected"}</p>
                  <button
                    class="ghost-button ghost-button--small"
                    data-action="map-editor-reinforcement-use-selected-unit"
                    type="button"
                    ${selectedEnemy ? "" : "disabled"}
                  >
                    Use Selected Enemy
                  </button>
                `
                : ""
            }
            <div class="map-editor-inline-actions">
              <button
                class="ghost-button ghost-button--small"
                data-action="map-editor-delete-reinforcement-wave"
                type="button"
              >
                Delete Wave
              </button>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderGoalSection(map, tileDetails) {
  const goal = map.goal;
  const targetBuilding = getMapGoalTargetBuilding(map, goal);
  const selectedBuilding = tileDetails?.building ?? null;
  const canUseSelectedBuilding =
    Boolean(selectedBuilding) &&
    (goal.type === MAP_GOAL_TYPES.RESCUE || goal.type === MAP_GOAL_TYPES.DEFEND);

  return `
    <div class="card-block">
      <p class="eyebrow">Goal</p>
      <div class="debug-grid">
        <label>
          <span>Type</span>
          <select data-map-editor-field="goalType">
            ${MAP_GOAL_ORDER.map(
              (goalType) => `
                <option value="${goalType}" ${goal.type === goalType ? "selected" : ""}>
                  ${getMapGoalLabel(goalType)}
                </option>
              `
            ).join("")}
          </select>
        </label>
        ${
          goal.type === MAP_GOAL_TYPES.DEFEND || goal.type === MAP_GOAL_TYPES.SURVIVE
            ? `
              <label>
                <span>Turns</span>
                <input
                  type="number"
                  data-map-editor-field="goalTurnLimit"
                  value="${goal.turnLimit ?? ""}"
                  min="1"
                  max="99"
                />
              </label>
            `
            : ""
        }
      </div>
      <p>${getMapGoalSummary(goal, map)}</p>
      ${
        goal.type === MAP_GOAL_TYPES.RESCUE || goal.type === MAP_GOAL_TYPES.DEFEND
          ? `
            <p><strong>Target</strong> ${targetBuilding ? `${targetBuilding.id} (${targetBuilding.x}, ${targetBuilding.y})` : "No building selected"}</p>
            <div class="map-editor-inline-actions">
              <button
                class="ghost-button ghost-button--small"
                data-action="map-editor-goal-use-selected-building"
                type="button"
                ${canUseSelectedBuilding ? "" : "disabled"}
              >
                Use Selected Building
              </button>
              <button
                class="ghost-button ghost-button--small"
                data-action="map-editor-goal-clear-target"
                type="button"
                ${targetBuilding ? "" : "disabled"}
              >
                Clear Target
              </button>
            </div>
            <p>${selectedBuilding ? `Selected building: ${selectedBuilding.id}` : "Select a building tile, then click Use Selected Building."}</p>
          `
          : ""
      }
    </div>
  `;
}

function renderFooterMeta(map, goalLabel, toolLabel, mirrorLabel) {
  return `
    <div class="battle-footer-meta map-editor-footer-meta" aria-label="Map editor summary">
      <div class="battle-footer-meta__item">
        <strong>Map</strong>
        <em>${map.name || "Untitled Map"}</em>
      </div>
      <div class="battle-footer-meta__item">
        <strong>Goal</strong>
        <em>${goalLabel}</em>
      </div>
      <div class="battle-footer-meta__item">
        <strong>Tool</strong>
        <em>${toolLabel}</em>
      </div>
      <div class="battle-footer-meta__item">
        <strong>Mirror</strong>
        <em>${mirrorLabel}</em>
      </div>
    </div>
  `;
}

export function renderMapEditorView(state, uiState = {}) {
  const map = state.mapEditor?.mapData;

  if (!map) {
    return `<div class="screen"><section class="panel"><p>No map loaded.</p></section></div>`;
  }

  const openAccordion = uiState.openAccordion ?? null;
  const validation = getMapEditorValidation(map);
  const tileDetails = getMapEditorTileDetails(map, state.mapEditor.selectedTile);
  const goalLabel = getMapGoalLabel(map.goal);
  const footerTool = renderCompactTool(state);
  const mirrorLabel = renderMirrorLabel(state.mapEditor.mirrorMode);
  const previewStyles = new Map();

  return `
    <div class="battle-shell map-editor-shell" data-screen-id="map-editor">
      <input class="battle-drawer-toggle" id="battle-intel-drawer" type="checkbox" aria-hidden="true" />
      <input class="battle-drawer-toggle" id="battle-command-drawer" type="checkbox" aria-hidden="true" />

      ${renderTopPanels(map, validation)}

      <aside class="battle-rail battle-rail--left map-editor-rail" data-map-editor-rail="left">
        <div class="battle-drawer-header">
          <span>Palette</span>
          <label class="ghost-button ghost-button--small" for="battle-intel-drawer">Close</label>
        </div>

        ${renderAccordion(
          MAP_EDITOR_ACCORDION_IDS.TERRAIN,
          "Terrain",
          "Click or drag to paint.",
          `
            <div class="map-editor-tool-grid">
              ${renderTerrainTools(state, previewStyles)}
            </div>
          `,
          openAccordion
        )}

        ${renderAccordion(
          MAP_EDITOR_ACCORDION_IDS.BUILDINGS,
          "Buildings",
          "Player, enemy, and neutral versions of every building.",
          `
            <div class="map-editor-owner-row">
              ${renderOwnerButtons(
                state.mapEditor.selectedBuildingOwner,
                "map-editor-select-building-owner",
                "data-building-owner",
                [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY, "neutral"]
              )}
            </div>
            <div class="map-editor-tool-grid">
              ${renderBuildingTools(state)}
            </div>
          `,
          openAccordion
        )}

        ${renderAccordion(
          MAP_EDITOR_ACCORDION_IDS.UNITS,
          "Units",
          "Place starting armies directly for either side.",
          `
            <div class="map-editor-owner-row">
              ${renderOwnerButtons(
                state.mapEditor.selectedUnitOwner,
                "map-editor-select-unit-owner",
                "data-unit-owner",
                [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY]
              )}
            </div>
            <div class="debug-grid">
              <label>
                <span>Level</span>
                <input
                  type="number"
                  data-map-editor-field="selectedUnitLevel"
                  value="${state.mapEditor.selectedUnitLevel ?? 1}"
                  min="1"
                  max="${MAP_EDITOR_MAX_UNIT_LEVEL}"
                />
              </label>
            </div>
            <div class="map-editor-tool-grid map-editor-tool-grid--units" data-map-editor-scroll="units">
              ${renderUnitTools(state, previewStyles)}
            </div>
          `,
          openAccordion
        )}

        ${renderAccordion(
          MAP_EDITOR_ACCORDION_IDS.REINFORCEMENTS,
          "Reinforcements",
          "Place enemy waves and tile triggers.",
          renderReinforcementPalette(state, previewStyles),
          openAccordion
        )}

        ${renderAccordion(
          MAP_EDITOR_ACCORDION_IDS.MIRROR,
          "Mirror + Cleanup",
          "Mirror your brush or switch cleanup tools.",
          `
            <div class="map-editor-mirror-grid">
              ${renderMirrorButtons(state)}
            </div>
            <div class="map-editor-tool-grid">
              ${renderCleanupTools(state)}
            </div>
          `,
          openAccordion
        )}

        ${renderQuickSelectSection(state, previewStyles)}
      </aside>

      <aside class="battle-rail battle-rail--right map-editor-rail" data-map-editor-rail="right">
        <div class="battle-drawer-header">
          <span>Inspector</span>
          <label class="ghost-button ghost-button--small" for="battle-command-drawer">Close</label>
        </div>

        <div class="card-block">
          <p class="eyebrow">Map Details</p>
          <div class="debug-grid">
            <label>
              <span>Name</span>
              <input
                type="text"
                data-map-editor-field="name"
                value="${map.name}"
                maxlength="60"
              />
            </label>
            <label>
              <span>Width</span>
              <input
                type="number"
                data-map-editor-field="width"
                value="${map.width}"
                min="6"
                max="32"
              />
            </label>
            <label>
              <span>Height</span>
              <input
                type="number"
                data-map-editor-field="height"
                value="${map.height}"
                min="6"
                max="32"
              />
            </label>
            <label>
              <span>Theme</span>
              <select data-map-editor-field="theme">
                ${getMapEditorThemeOptions()
                  .map(
                    (theme) => `
                      <option value="${theme}" ${map.theme === theme ? "selected" : ""}>
                        ${theme} (${MAP_THEME_PALETTES[theme].accent})
                      </option>
                    `
                  )
                  .join("")}
              </select>
            </label>
          </div>
        </div>

        ${renderRunSetupSection(map, state.mapEditor.mapStages)}
        ${renderReinforcementSection(state, tileDetails)}
        ${renderHistorySection(state)}
        ${renderGoalSection(map, tileDetails)}
        ${renderTileSummary(tileDetails)}
      </aside>

      ${renderFooterMeta(map, goalLabel, footerTool, mirrorLabel)}

      <div class="map-editor-footer-controls" aria-label="Map editor controls">
        <label
          class="ghost-button ghost-button--small map-editor-footer-controls__drawer"
          for="battle-intel-drawer"
        >
          Palette
        </label>
        <button
          class="ghost-button ghost-button--small map-editor-footer-controls__button map-editor-footer-controls__button--secondary"
          data-action="map-editor-new"
          type="button"
        >
          New Map
        </button>
        <button
          class="ghost-button ghost-button--small map-editor-footer-controls__button map-editor-footer-controls__button--secondary"
          data-action="back-to-title"
          type="button"
        >
          Back
        </button>
        <label
          class="ghost-button ghost-button--small map-editor-footer-controls__drawer"
          for="battle-command-drawer"
        >
          Inspector
        </label>
      </div>

      ${renderMapLoadDialog(state)}
      ${
        previewStyles.size > 0
          ? `<style data-map-editor-preview-styles="true">\n${Array.from(previewStyles.values()).join("\n")}\n</style>`
          : ""
      }
    </div>
  `;
}
