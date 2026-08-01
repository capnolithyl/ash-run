import { getCommanderById } from "../../game/content/commanders.js";
import { getCommanderPortraitImageUrl } from "../../game/content/commanderArt.js";
import { UNIT_CATALOG } from "../../game/content/unitCatalog.js";
import {
  RUN_UNIT_NAME_MAX_LENGTH,
  validateRunUnitName
} from "../../game/content/runUnitNames.js";
import { getUnitSpriteDefinition } from "../../game/phaser/assets.js";
import { escapeHtml, escapeHtmlAttribute } from "../shared/html.js";

const UNIT_FAMILY_LABELS = {
  infantry: "Infantry",
  vehicle: "Vehicle",
  air: "Air Wing"
};

function sanitizeCssIdentifier(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unit-preview";
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

function buildUnitPreviewKeyframes(unitTypeId, animationId, frameIndices, columns, rows) {
  if (frameIndices.length <= 1) {
    return { animationName: "", css: "" };
  }

  const animationName = [
    "run-unit-preview",
    sanitizeCssIdentifier(unitTypeId),
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

function getLoadoutCounts(units = []) {
  const counts = new Map();

  for (const draft of units) {
    const unitTypeId = typeof draft === "string" ? draft : draft.unitTypeId;
    counts.set(unitTypeId, (counts.get(unitTypeId) ?? 0) + 1);
  }

  return counts;
}

function renderUnitPreview(unitTypeId, unitName, previewStyles, colorOptions = {}) {
  const spriteDefinition = getUnitSpriteDefinition(unitTypeId, "player", colorOptions);
  const idleAnimation = spriteDefinition?.idle ?? null;
  const idleFrameIndices = getAnimationRangeFrameIndices(idleAnimation, "default");
  const idleFrameCount = idleFrameIndices.length;

  if (idleAnimation && idleFrameCount > 0) {
    const sheetColumns = Math.max(1, idleAnimation.sheetColumns ?? idleFrameCount);
    const sheetRows = Math.max(1, idleAnimation.sheetRows ?? 1);
    const durationSeconds = Math.max(
      idleFrameCount / Math.max(idleAnimation.frameRate ?? 1, 1),
      0.45
    ).toFixed(2);
    const { animationName, css } = buildUnitPreviewKeyframes(
      unitTypeId,
      "idle",
      idleFrameIndices,
      sheetColumns,
      sheetRows
    );
    const startPosition = getSpriteSheetFramePosition(
      idleFrameIndices[0],
      sheetColumns,
      sheetRows
    );

    if (css && animationName) {
      previewStyles.set(animationName, css);
    }

    return `
      <div
        class="run-unit-card__preview-image run-unit-card__preview-image--sheet"
        role="img"
        aria-label="${unitName} battlefield animation preview"
        data-fallback-src="${spriteDefinition.fallbackUrl ?? ""}"
      >
        <div
          class="run-unit-card__preview-sheet-surface"
          style="
            --preview-columns:${sheetColumns};
            --preview-rows:${sheetRows};
            --sheet-duration:${durationSeconds}s;
            --preview-start-x:${startPosition.x};
            --preview-start-y:${startPosition.y};
            background-image:url('${idleAnimation.url}');
            ${animationName ? `animation-name:${animationName};` : ""}
          "
          aria-hidden="true"
        ></div>
      </div>
    `;
  }

  if (spriteDefinition?.fallbackUrl) {
    return `
      <img
        class="run-unit-card__preview-image"
        src="${spriteDefinition.fallbackUrl}"
        alt="${unitName} battlefield preview"
        loading="lazy"
        decoding="async"
      />
    `;
  }

  return `<div class="run-unit-card__preview-fallback" aria-hidden="true">${unitName.slice(0, 2).toUpperCase()}</div>`;
}

function renderSelectedSquad(counts) {
  if (counts.size === 0) {
    return `<p class="run-loadout-selected__empty">No units purchased yet. Add at least one unit to begin the run.</p>`;
  }

  return `
    <div class="run-loadout-selected__chips">
      ${Array.from(counts.entries()).map(([unitTypeId, count]) => {
        const unitName = UNIT_CATALOG[unitTypeId]?.name ?? unitTypeId;
        return `<span class="run-loadout-selected__chip">${count}x ${escapeHtml(unitName)}</span>`;
      }).join("")}
    </div>
  `;
}

function renderDeploymentIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M10 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M15.5 8.5h3.5v7h-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
  `;
}

function renderCommanderSummaryLines(commander) {
  return `
    <p><span>Passive:</span> ${commander?.passive?.summary ?? "No passive summary available."}</p>
    <p><span>Power:</span> ${commander?.active?.summary ?? "No power summary available."}</p>
  `;
}

function getDraftNameValidation(drafts, draft) {
  return validateRunUnitName(
    draft.name,
    drafts.filter((candidate) => candidate.id !== draft.id).map((candidate) => candidate.name)
  );
}

function renderRunNamingReview(drafts, previewStyles, colorOptions) {
  if (drafts.length === 0) {
    return "";
  }

  const rows = drafts.map((draft, index) => {
    const unitType = UNIT_CATALOG[draft.unitTypeId];

    if (!unitType) {
      return "";
    }

    const validation = getDraftNameValidation(drafts, draft);
    const errorId = `run-unit-name-error-${sanitizeCssIdentifier(draft.id)}`;

    return `
      <div class="run-naming-row">
        <div class="run-unit-card__preview run-naming-row__preview">
          ${renderUnitPreview(draft.unitTypeId, unitType.name, previewStyles, colorOptions)}
        </div>
        <div class="run-naming-row__identity">
          <strong>${escapeHtml(unitType.name)}</strong>
          <span>${escapeHtml(UNIT_FAMILY_LABELS[unitType.family] ?? unitType.family)} · Unit ${index + 1}</span>
        </div>
        <label class="run-naming-row__field">
          <span>Unit name</span>
          <input
            type="text"
            value="${escapeHtmlAttribute(draft.name)}"
            maxlength="${RUN_UNIT_NAME_MAX_LENGTH}"
            autocomplete="off"
            spellcheck="false"
            data-run-loadout-unit-name="${escapeHtmlAttribute(draft.id)}"
            aria-describedby="${errorId}"
            aria-invalid="${validation.valid ? "false" : "true"}"
          />
          <small id="${errorId}" class="run-naming-row__error">${escapeHtml(validation.error)}</small>
        </label>
        <button
          class="ghost-button ghost-button--small run-naming-row__randomize"
          data-action="randomize-run-loadout-name"
          data-unit-id="${escapeHtmlAttribute(draft.id)}"
          aria-label="Randomize name for ${escapeHtmlAttribute(unitType.name)} unit ${index + 1}"
        >
          Randomize
        </button>
      </div>
    `;
  }).join("");
  const allNamesValid = drafts.every((draft) => getDraftNameValidation(drafts, draft).valid);

  return `
    <div class="run-naming-overlay">
      <section
        class="overlay-card run-naming-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-naming-title"
        aria-describedby="run-naming-description"
      >
        <div class="run-naming-dialog__header">
          <div>
            <p class="eyebrow">Final Roster</p>
            <h2 id="run-naming-title">Name Your Squad</h2>
            <p id="run-naming-description">Give each unit a name or draw another from its role-specific pool.</p>
          </div>
          <button class="ghost-button" data-action="close-run-naming-review">Back</button>
        </div>
        <div class="run-naming-list">
          ${rows}
        </div>
        <div class="run-naming-dialog__footer">
          <button
            class="menu-button run-loadout-start-button"
            data-action="start-run"
            ${allNamesValid ? "" : "disabled"}
          >
            <span class="title-button__content">
              <span class="title-button__icon run-loadout-start-button__icon">${renderDeploymentIcon()}</span>
              <span class="title-button__label">Deploy To Map One</span>
            </span>
          </button>
        </div>
      </section>
    </div>
  `;
}

export function renderRunLoadoutView(state) {
  const commander = getCommanderById(state.selectedCommanderId);
  const commanderPortraitUrl = commander ? getCommanderPortraitImageUrl(commander.id) : null;
  const runLoadout = state.runLoadout ?? { budget: 1000, fundsRemaining: 1000, units: [] };
  const unlockedUnitIds = state.metaState.unlockedUnitIds ?? [];
  const loadoutCounts = getLoadoutCounts(runLoadout.units);
  const purchasedUnitCount = runLoadout.units.length;
  const budgetLabel = `${runLoadout.fundsRemaining ?? 0}/${runLoadout.budget ?? 0}`;
  const previewStyles = new Map();
  const unitCardsMarkup = unlockedUnitIds.map((unitTypeId) => {
    const unit = UNIT_CATALOG[unitTypeId];
    const count = loadoutCounts.get(unitTypeId) ?? 0;
    const canAfford = (runLoadout.fundsRemaining ?? 0) >= (unit?.cost ?? Number.POSITIVE_INFINITY);

    if (!unit) {
      return "";
    }

    return `
      <article class="run-loadout-unit-card ${count > 0 ? "run-loadout-unit-card--selected" : ""}">
        <button
          class="ghost-button ghost-button--small run-loadout-unit-card__adjust"
          data-action="run-loadout-remove"
          data-unit-type-id="${escapeHtmlAttribute(unitTypeId)}"
          aria-label="Remove ${escapeHtmlAttribute(unit.name)} from starting squad"
          ${count > 0 ? "" : "disabled"}
        >
          −
        </button>
        <div class="run-loadout-unit-card__center">
          <div class="run-loadout-unit-card__identity">
            <div class="run-unit-card__preview run-loadout-unit-card__preview">
              ${renderUnitPreview(unitTypeId, unit.name, previewStyles, state.metaState?.options)}
            </div>
            <div class="run-loadout-unit-card__body">
              <strong>${escapeHtml(unit.name)}</strong>
              <span>${escapeHtml(UNIT_FAMILY_LABELS[unit.family] ?? unit.family)}</span>
              <small>${unit.cost} funds</small>
            </div>
          </div>
          <div class="run-loadout-unit-card__count" aria-label="${count} purchased">
            <span>Count</span>
            <strong>${count}</strong>
          </div>
        </div>
        <button
          class="ghost-button ghost-button--small run-loadout-unit-card__adjust"
          data-action="run-loadout-add"
          data-unit-type-id="${escapeHtmlAttribute(unitTypeId)}"
          aria-label="Add ${escapeHtmlAttribute(unit.name)} to starting squad"
          ${canAfford ? "" : "disabled"}
        >
          +
        </button>
      </article>
    `;
  }).join("");
  const namingReviewMarkup = runLoadout.namingReviewOpen
    ? renderRunNamingReview(runLoadout.units, previewStyles, state.metaState?.options)
    : "";
  const previewStyleMarkup = previewStyles.size > 0
    ? `<style>${Array.from(previewStyles.values()).join("\n")}</style>`
    : "";

  return `
    <div class="screen screen--commander screen--run-loadout" data-screen-id="run-loadout">
      ${previewStyleMarkup}
      <div class="title-scene commander-scene" aria-hidden="true">
        <div class="title-scene__stars"></div>
        <div class="title-scene__sun"></div>
        <div class="title-scene__orb title-scene__orb--one"></div>
        <div class="title-scene__orb title-scene__orb--two"></div>
        <div class="title-scene__haze"></div>
        <div class="title-scene__mountains title-scene__mountains--far"></div>
        <div class="title-scene__mountains title-scene__mountains--near"></div>
        <div class="title-scene__grid"></div>
      </div>
      <section class="panel panel--wide panel--static commander-select-panel run-loadout-panel">
        <div class="panel-header panel-header--commander">
          <div class="commander-select-heading">
            <p class="eyebrow">Starting Squad</p>
            <h2>Build Your Opening Force</h2>
            <p>Spend your deployment budget, lock in your opening roster, and roll into map one.</p>
          </div>
          <button class="ghost-button" data-action="back-to-commander-select">Back</button>
        </div>
        <section class="run-loadout-topband">
          <section class="run-loadout-summary-card run-loadout-summary-card--commander" style="--accent:${commander?.accent ?? "#ffa95e"}">
            <span class="run-loadout-summary-card__label">Selected Commander</span>
            <div class="run-loadout-commander">
              <div class="run-loadout-commander__body">
                <strong>${commander?.name ?? "Commander"}</strong>
                <span>${commander?.title ?? "Doctrine"}</span>
                <div class="run-loadout-commander__summary">
                  ${renderCommanderSummaryLines(commander)}
                </div>
                <details class="run-loadout-commander__details">
                  <summary>Commander Details</summary>
                  <div class="run-loadout-commander__details-copy">
                    ${renderCommanderSummaryLines(commander)}
                  </div>
                </details>
              </div>
              ${commanderPortraitUrl
                ? `
                  <img
                    class="run-loadout-commander__portrait"
                    src="${commanderPortraitUrl}"
                    alt="${commander?.name ?? "Commander"} portrait"
                    loading="lazy"
                    decoding="async"
                  />
                `
                : ""}
            </div>
          </section>
          <section class="run-loadout-summary-card run-loadout-summary-card--squad">
            <div class="run-loadout-summary-card__header">
              <span class="run-loadout-summary-card__label">Selected Squad</span>
              <div class="run-loadout-budget-pill run-loadout-budget-pill--inline">
                <span>Funds</span>
                <strong>${budgetLabel}</strong>
              </div>
            </div>
            ${renderSelectedSquad(loadoutCounts)}
          </section>
        </section>
        <div class="run-loadout-layout">
          <section class="run-loadout-catalog">
            <div class="run-loadout-catalog__header">
              <div>
                <span class="run-loadout-summary-card__label">Unit Catalog</span>
              </div>
            </div>
            <div class="run-loadout-grid-shell" data-role="run-loadout-grid-shell">
              <div class="run-loadout-unit-grid">
                ${unitCardsMarkup}
              </div>
            </div>
          </section>
        </div>
        <div class="panel-footer run-loadout-panel__footer">
          <button
            class="menu-button run-loadout-start-button"
            data-role="start-run-button"
            data-action="open-run-naming-review"
            ${purchasedUnitCount > 0 ? "" : "disabled"}
          >
            <span class="title-button__content">
              <span class="title-button__icon run-loadout-start-button__icon">${renderDeploymentIcon()}</span>
              <span class="title-button__label">Begin Deployment</span>
            </span>
          </button>
        </div>
      </section>
      ${namingReviewMarkup}
    </div>
  `;
}
