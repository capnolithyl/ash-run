import { getCommanderById } from "../../game/content/commanders.js";
import { getCommanderPortraitImageUrl } from "../../game/content/commanderArt.js";
import { UNIT_CATALOG } from "../../game/content/unitCatalog.js";
import { getUnitSpriteDefinition } from "../../game/phaser/assets.js";
import { titleCaseSlot } from "../formatters.js";

const UNIT_FAMILY_LABELS = {
  infantry: "Infantry",
  vehicle: "Vehicle",
  air: "Air Wing"
};

function getLoadoutCounts(units = []) {
  const counts = new Map();

  for (const unitTypeId of units) {
    counts.set(unitTypeId, (counts.get(unitTypeId) ?? 0) + 1);
  }

  return counts;
}

function formatUnitRange(unit) {
  if (unit.minRange === unit.maxRange) {
    return `${unit.maxRange}`;
  }

  return `${unit.minRange}-${unit.maxRange}`;
}

function renderUnitPreview(unitTypeId, unitName) {
  const spriteDefinition = getUnitSpriteDefinition(unitTypeId, "player");

  if (spriteDefinition?.type === "spritesheet") {
    const durationSeconds = Math.max(
      spriteDefinition.frameCount / Math.max(spriteDefinition.frameRate ?? 1, 1),
      0.45
    ).toFixed(2);

    return `
      <div
        class="run-unit-card__preview-image run-unit-card__preview-image--sheet"
        style="--frame-count:${spriteDefinition.frameCount}; --sheet-duration:${durationSeconds}s; background-image:url('${spriteDefinition.url}')"
        role="img"
        aria-label="${unitName} battlefield animation preview"
      ></div>
    `;
  }

  if (spriteDefinition?.url) {
    return `
      <img
        class="run-unit-card__preview-image"
        src="${spriteDefinition.url}"
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
        return `<span class="run-loadout-selected__chip">${count}x ${unitName}</span>`;
      }).join("")}
    </div>
  `;
}

export function renderRunLoadoutView(state) {
  const commander = getCommanderById(state.selectedCommanderId);
  const commanderPortraitUrl = commander ? getCommanderPortraitImageUrl(commander.id) : null;
  const runLoadout = state.runLoadout ?? { budget: 1000, fundsRemaining: 1000, units: [] };
  const unlockedUnitIds = state.metaState.unlockedUnitIds ?? [];
  const loadoutCounts = getLoadoutCounts(runLoadout.units);
  const spentFunds = Math.max(0, (runLoadout.budget ?? 0) - (runLoadout.fundsRemaining ?? 0));
  const purchasedUnitCount = runLoadout.units.length;

  return `
    <div class="screen screen--commander screen--run-loadout" data-screen-id="run-loadout">
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
        <div class="run-loadout-layout">
          <aside class="run-loadout-sidebar">
            <section class="run-loadout-summary-card run-loadout-summary-card--commander" style="--accent:${commander?.accent ?? "#ffa95e"}">
              <span class="run-loadout-summary-card__label">Selected Commander</span>
              <div class="run-loadout-commander">
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
                <div class="run-loadout-commander__body">
                  <strong>${commander?.name ?? "Commander"}</strong>
                  <span>${commander?.title ?? "Doctrine"}</span>
                  <p><span>Passive:</span> ${commander?.passive?.summary ?? "No passive summary available."}</p>
                  <p><span>Power:</span> ${commander?.active?.summary ?? "No power summary available."}</p>
                </div>
              </div>
            </section>
            <section class="run-loadout-summary-card">
              <span class="run-loadout-summary-card__label">Budget</span>
              <div class="run-loadout-budget-grid">
                <div class="run-loadout-budget-card">
                  <span>Starting Funds</span>
                  <strong>${runLoadout.budget ?? 0}</strong>
                </div>
                <div class="run-loadout-budget-card run-loadout-budget-card--highlight">
                  <span>Funds Remaining</span>
                  <strong>${runLoadout.fundsRemaining ?? 0}</strong>
                </div>
                <div class="run-loadout-budget-card">
                  <span>Funds Committed</span>
                  <strong>${spentFunds}</strong>
                </div>
                <div class="run-loadout-budget-card">
                  <span>Units Purchased</span>
                  <strong>${purchasedUnitCount}</strong>
                </div>
              </div>
            </section>
            <section class="run-loadout-summary-card">
              <span class="run-loadout-summary-card__label">Selected Squad</span>
              ${renderSelectedSquad(loadoutCounts)}
            </section>
          </aside>
          <section class="run-loadout-catalog">
            <div class="run-loadout-catalog__header">
              <div>
                <span class="run-loadout-summary-card__label">Unit Catalog</span>
                <h3>Purchase Units</h3>
              </div>
              <p>These use the same battlefield art your units will deploy with in combat.</p>
            </div>
            <div class="run-loadout-unit-grid">
              ${unlockedUnitIds.map((unitTypeId) => {
                const unit = UNIT_CATALOG[unitTypeId];
                const count = loadoutCounts.get(unitTypeId) ?? 0;
                const canAfford = (runLoadout.fundsRemaining ?? 0) >= (unit?.cost ?? Number.POSITIVE_INFINITY);

                if (!unit) {
                  return "";
                }

                return `
                  <article class="run-unit-card ${count > 0 ? "run-unit-card--selected" : ""}">
                    <div class="run-unit-card__preview">
                      ${renderUnitPreview(unitTypeId, unit.name)}
                    </div>
                    <div class="run-unit-card__body">
                      <div class="run-unit-card__header">
                        <div>
                          <strong>${unit.name}</strong>
                          <span>${UNIT_FAMILY_LABELS[unit.family] ?? unit.family}</span>
                        </div>
                        <span class="run-unit-card__cost">${unit.cost}</span>
                      </div>
                      <div class="run-unit-card__stats">
                        <span>ATK ${unit.attack}</span>
                        <span>ARM ${unit.armor}</span>
                        <span>MV ${unit.movement}</span>
                        <span>RNG ${formatUnitRange(unit)}</span>
                        <span>HP ${unit.maxHealth}</span>
                        <span>AMMO ${unit.ammoMax}</span>
                      </div>
                      <div class="run-unit-card__actions">
                        <button
                          class="ghost-button ghost-button--small"
                          data-action="run-loadout-remove"
                          data-unit-type-id="${unitTypeId}"
                          aria-label="Remove ${unit.name} from starting squad"
                          ${count > 0 ? "" : "disabled"}
                        >
                          -
                        </button>
                        <div class="run-unit-card__count">
                          <span>Selected</span>
                          <strong>${count}</strong>
                        </div>
                        <button
                          class="ghost-button ghost-button--small"
                          data-action="run-loadout-add"
                          data-unit-type-id="${unitTypeId}"
                          aria-label="Add ${unit.name} to starting squad"
                          ${canAfford ? "" : "disabled"}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </article>
                `;
              }).join("")}
            </div>
          </section>
        </div>
        <div class="panel-footer run-loadout-panel__footer">
          <div class="footer-meta">
            <span>Selected slot: ${titleCaseSlot(state.selectedSlotId)}</span>
            <span>Commander: ${commander?.name ?? "Unassigned"}</span>
          </div>
          <button
            class="menu-button"
            data-role="start-run-button"
            data-action="start-run"
            ${purchasedUnitCount > 0 ? "" : "disabled"}
          >
            Begin Deployment
          </button>
        </div>
      </section>
    </div>
  `;
}
