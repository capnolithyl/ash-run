import { BATTLE_MODES, BATTLE_NOTICE_DISPLAY_MS, TURN_SIDES } from "../../../game/core/constants.js";
import {
  canUnitEquipRunUpgrade,
  getRunUpgradeById,
  getRunUpgradeRarityAsset,
  RUN_UPGRADE_RARITY_LABELS
} from "../../../game/content/runUpgrades.js";
import { UNIT_CATALOG } from "../../../game/content/unitCatalog.js";
import {
  getRunUnitNameKey,
  validateRunUnitName
} from "../../../game/content/runUnitNames.js";
import { getUnitSpriteDefinition } from "../../../game/phaser/assets.js";
import { describeRunCardsForState } from "../../../game/simulation/runCardEffects.js";
import { renderOptionFields } from "../optionFieldsView.js";
import { renderDebugControls } from "./interactionPanels.js";
import { escapeHtml, escapeHtmlAttribute } from "../../shared/html.js";
import { renderFieldManualPanel } from "../tutorialView.js";

const BATTLE_NOTICE_HELD_IN_MS = 180;

function renderIntelBreakdown(runState) {
  const intelLedger = runState?.intelLedger;

  if (!intelLedger) {
    return "";
  }

  return `
    <div class="battle-results-breakdown">
      <h3>Intel Breakdown</h3>
      <div class="battle-results-breakdown__row"><span>Captures</span><strong>${intelLedger.capture}</strong></div>
      <div class="battle-results-breakdown__row"><span>Map Clears</span><strong>${intelLedger.mapClear}</strong></div>
      <div class="battle-results-breakdown__row"><span>Run Clear Bonus</span><strong>${intelLedger.runClearBonus}</strong></div>
      <div class="battle-results-breakdown__row battle-results-breakdown__row--total"><span>Total Earned</span><strong>${intelLedger.total}</strong></div>
    </div>
  `;
}

function renderRunRewardChoice(choice) {
  if (choice.type === "unit") {
    return `
      <button class="menu-button" data-action="select-run-reward" data-reward-id="${choice.id}">
        <strong>${choice.name}</strong><br />
        <small>${choice.summary}</small>
      </button>
    `;
  }

  const rarityLabel = RUN_UPGRADE_RARITY_LABELS[choice.rarity] ?? "Run Card";
  const imageUrl = getRunUpgradeRarityAsset(choice);

  return `
    <button
      class="run-reward-card run-reward-card--${choice.rarity ?? "common"}"
      data-action="select-run-reward"
      data-reward-id="${choice.id}"
      style="--run-card-image:url('${imageUrl}')"
    >
      <span class="run-reward-card__rarity">${rarityLabel}</span>
      <strong>${choice.name}</strong>
      <small>${choice.summary}</small>
    </button>
  `;
}

function renderOwnedRunCardItem(card, { status = "active" } = {}) {
  const rarityLabel = RUN_UPGRADE_RARITY_LABELS[card.rarity] ?? "Run Card";
  const imageUrl = getRunUpgradeRarityAsset(card);

  return `
    <li
      class="run-card-list__item run-card-list__item--${status} run-card-list__item--${card.rarity ?? "common"}"
      style="--run-card-image:url('${imageUrl}')"
    >
      <span class="run-card-list__rarity">${rarityLabel}</span>
      <strong>${card.name}</strong>
      <small>${status === "superseded" ? "Superseded by a higher tier." : card.summary}</small>
    </li>
  `;
}

function getStaticSpriteSheetPosition(frameIndex, columns, rows) {
  const resolvedColumns = Math.max(1, columns);
  const resolvedRows = Math.max(1, rows);
  const column = Math.max(0, frameIndex % resolvedColumns);
  const row = Math.max(0, Math.floor(frameIndex / resolvedColumns));
  const x = resolvedColumns > 1 ? `${((column / (resolvedColumns - 1)) * 100).toFixed(4)}%` : "0%";
  const y = resolvedRows > 1 ? `${((row / (resolvedRows - 1)) * 100).toFixed(4)}%` : "0%";

  return { x, y };
}

function renderLevelUpUnitArt(levelUpEvent, colorOptions = {}) {
  const spriteDefinition = getUnitSpriteDefinition(
    levelUpEvent.unitTypeId,
    levelUpEvent.owner,
    colorOptions
  );
  const idleAnimation = spriteDefinition?.idle ?? null;
  const frameStart = idleAnimation?.ranges?.default?.start ?? 0;
  const frameCount = idleAnimation?.ranges?.default
    ? idleAnimation.ranges.default.end - idleAnimation.ranges.default.start + 1
    : 1;
  const columns = Math.max(1, idleAnimation?.sheetColumns ?? frameCount);
  const rows = Math.max(1, idleAnimation?.sheetRows ?? 1);
  const startPosition = getStaticSpriteSheetPosition(frameStart, columns, rows);

  if (idleAnimation?.url) {
    return `
      <div class="level-up-art level-up-art--sheet" aria-hidden="true">
        <div
          class="level-up-art__sheet"
          style="
            --level-up-sheet-columns:${columns};
            --level-up-sheet-rows:${rows};
            --level-up-sheet-start-x:${startPosition.x};
            --level-up-sheet-start-y:${startPosition.y};
            background-image:url('${idleAnimation.url}');
          "
        ></div>
      </div>
    `;
  }

  if (spriteDefinition?.fallbackUrl) {
    return `
      <div class="level-up-art">
        <img
          class="level-up-art__image"
          src="${spriteDefinition.fallbackUrl}"
          alt=""
          loading="eager"
          decoding="async"
        />
      </div>
    `;
  }

  return `
    <div class="level-up-art level-up-art--fallback" aria-hidden="true">
      <span>${escapeHtml(levelUpEvent.unitName.slice(0, 2).toUpperCase())}</span>
    </div>
  `;
}

function buildFinalLevelUpPresentation(levelUpEvent) {
  const statSheet = levelUpEvent.statSheet ?? levelUpEvent.statGains?.map((gain) => ({
    stat: gain.stat,
    label: gain.label,
    beforeValue: gain.previousValue,
    afterValue: gain.nextValue,
    delta: gain.delta,
    changed: gain.delta > 0
  })) ?? [];

  return {
    continueEnabled: true,
    rows: statSheet.map((entry) => ({
      ...entry,
      displayValue: entry.afterValue,
      phase: entry.changed ? "settled" : "static"
    }))
  };
}

export function renderLevelUpOverlay(battleSnapshot, presentation = null, colorOptions = {}) {
  const levelUpEvent = battleSnapshot.levelUpQueue?.[0];

  if (!levelUpEvent) {
    return "";
  }

  const resolvedPresentation = presentation ?? buildFinalLevelUpPresentation(levelUpEvent);
  const rows = resolvedPresentation.rows ?? [];
  const continueEnabled = resolvedPresentation.continueEnabled !== false;
  const levelUpKey = `${levelUpEvent.unitId}-${levelUpEvent.previousLevel}-${levelUpEvent.newLevel}`;
  const unitTypeName = UNIT_CATALOG[levelUpEvent.unitTypeId]?.name ?? levelUpEvent.unitTypeId;

  return `
    <div class="battle-overlay battle-overlay--level-up" data-level-up-key="${levelUpKey}">
      <div class="overlay-card overlay-card--level-up${continueEnabled ? " overlay-card--level-up-ready" : ""}">
        <div class="level-up-card__header">
          <p class="eyebrow">Level Up</p>
          <h2>${escapeHtml(levelUpEvent.unitName)}</h2>
          <p>${escapeHtml(unitTypeName)} &middot; Level ${levelUpEvent.previousLevel} to ${levelUpEvent.newLevel}</p>
        </div>
        <div class="level-up-card__body">
          <div class="level-up-card__stats">
            <div class="level-up-card__stats-header" aria-hidden="true">
              <span class="level-up-card__stats-head level-up-card__stats-head--label">Stat</span>
              <span class="level-up-card__stats-head">Current</span>
              <span class="level-up-card__stats-head">New</span>
            </div>
            ${rows
            .map(
              (entry) => `
                <div
                  class="level-up-stat level-up-stat--${entry.phase ?? "static"}${entry.changed ? " level-up-stat--changed" : ""}"
                  data-level-up-stat="${entry.stat}"
                >
                  <span class="level-up-stat__label">${entry.label}</span>
                  <span class="level-up-stat__current">${entry.beforeValue}</span>
                  <strong
                    class="level-up-stat__next${entry.changed && entry.phase !== "pending" ? "" : " level-up-stat__next--empty"}"
                    data-level-up-display="${entry.stat}"
                    ${entry.changed && entry.phase !== "pending" ? "" : ' aria-hidden="true"'}
                  >${entry.changed && entry.phase !== "pending" ? entry.displayValue : "--"}</strong>
                </div>
              `
            )
            .join("")}
          </div>
          ${renderLevelUpUnitArt(levelUpEvent, colorOptions)}
        </div>
        <div class="level-up-card__footer${continueEnabled ? " level-up-card__footer--visible" : ""}">
          <button class="menu-button" data-action="acknowledge-level-up" ${continueEnabled ? "" : "disabled"}>Continue</button>
        </div>
      </div>
    </div>
  `;
}

export function renderTurnBanner(turnBanner) {
  if (!turnBanner) {
    return "";
  }

  return `
    <div class="turn-banner turn-banner--${turnBanner.side}">
      <div class="turn-banner__card">
        <p class="eyebrow">Turn ${turnBanner.number}</p>
        <h2>${turnBanner.side === TURN_SIDES.PLAYER ? "Player Turn" : "Enemy Turn"}</h2>
      </div>
    </div>
  `;
}

export function renderBattleNotice(notice) {
  if (!notice) {
    return "";
  }

  const isPersistent = notice.persistent === true;
  const durationMs = Math.max(1, Number(notice.durationMs) || BATTLE_NOTICE_DISPLAY_MS);
  const now = Date.now();
  const createdAt = Number(notice.createdAt) || now;
  const persistentElapsedMs = Math.max(0, now - createdAt);
  const elapsedMs = isPersistent
    ? 0
    : Math.max(0, Math.min(durationMs - 1, persistentElapsedMs));
  const noticeStyle = `--notice-duration:${durationMs}ms;--notice-delay:-${elapsedMs}ms;`;
  const placement = notice.placement === "bottom" ? "bottom" : "top";
  const holdClass = isPersistent
    ? ` battle-notice--held${persistentElapsedMs >= BATTLE_NOTICE_HELD_IN_MS ? " battle-notice--held-ready" : ""}`
    : "";

  return `
    <div class="battle-notice battle-notice--${notice.tone ?? "info"} battle-notice--${placement}${holdClass}" style="${noticeStyle}" role="status" aria-live="polite">
      <strong>${notice.title}</strong>
      <span>${notice.message}</span>
    </div>
  `;
}

export function renderPowerOverlay(powerOverlay) {
  if (!powerOverlay) {
    return "";
  }

  const sideLabel = powerOverlay.side === TURN_SIDES.PLAYER ? "Player Power" : "Enemy Power";
  const portraitMarkup = powerOverlay.portraitImageUrl
    ? `
      <div class="power-overlay__portrait-frame" aria-hidden="true">
        <div class="power-overlay__portrait-shell">
          <img
            class="power-overlay__portrait"
            src="${powerOverlay.portraitImageUrl}"
            alt=""
            loading="eager"
            decoding="async"
          />
        </div>
      </div>
    `
    : "";

  return `
    <div class="battle-overlay battle-overlay--power battle-overlay--power-${powerOverlay.side}" style="--accent:${powerOverlay.accent}">
      <div class="overlay-card overlay-card--power">
        <div class="power-overlay__fx power-overlay__fx--back" aria-hidden="true"></div>
        <div class="power-overlay__fx power-overlay__fx--front" aria-hidden="true"></div>
        <div class="power-overlay__content">
          ${portraitMarkup}
          <div class="power-overlay__copy">
            <p class="eyebrow">${sideLabel} Activated</p>
            <span class="power-overlay__commander-kicker">Commander</span>
            <strong class="power-overlay__commander-name">${powerOverlay.commanderName}</strong>
            <span class="power-overlay__commander-title">${powerOverlay.commanderTitle ?? "Commander"}</span>
            <h2>${powerOverlay.powerName}</h2>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderPauseOverlay(state, battleSnapshot, displayContext = {}) {
  if (!state.battleUi.pauseMenuOpen) {
    return "";
  }

  const confirmingExit = state.battleUi.confirmAbandon;
  const isRunBattle = Boolean(state.runState) && !state.debugMode;
  const isTutorialBattle = battleSnapshot?.mode === BATTLE_MODES.TUTORIAL;
  const tutorialManualOpen = isTutorialBattle && state.battleUi.tutorialManualOpen;
  const debugContent = state.debugMode
    ? renderDebugControls(state, battleSnapshot, {
        activeTool: displayContext.activeDebugTool
      })
    : "";

  return `
    <div class="battle-overlay battle-overlay--pause">
      <div class="overlay-card overlay-card--pause${state.debugMode ? " overlay-card--pause-debug" : ""}">
        <div class="pause-card__header">
          <p class="eyebrow">Paused</p>
          <h2>Battle Intermission</h2>
        </div>
        ${
          confirmingExit
            ? `
              <div class="pause-card__body">
                <div class="pause-warning">
                  <p>${isRunBattle ? "Forfeit this run?" : "Return to the main menu?"}</p>
                  <p>${
                    isRunBattle
                      ? "The battle will count as a loss. Earned Intel Credits stay banked, but you will not get a map-clear payout."
                      : "The active battle will be discarded when you leave this screen."
                  }</p>
                </div>
              </div>
              <div class="battle-actions">
                <button class="menu-button menu-button--danger" data-action="confirm-abandon-run">${isRunBattle ? "Forfeit Run" : "Return To Main Menu"}</button>
                <button class="ghost-button" data-action="cancel-abandon-run">Keep Playing</button>
              </div>
            `
            : tutorialManualOpen
              ? `
                <div class="pause-card__body pause-card__body--manual">
                  ${renderFieldManualPanel({ compact: true })}
                </div>
                <div class="battle-actions">
                  <button class="menu-button" data-action="close-pause-field-manual">Back to Pause</button>
                </div>
              `
              : `
              <div class="pause-card__body">
                <div class="options-list options-list--compact">
                  ${renderOptionFields(state.metaState.options, {
                    ...displayContext,
                    showDisplayOptions: true,
                    tabScope: "battle-pause",
                    defaultOptionsTab: state.debugMode ? "debug" : "display",
                    debugContent
                  })}
                </div>
              </div>
              <div class="battle-actions">
                <button class="menu-button" data-action="resume-battle">Continue Battle</button>
                ${isTutorialBattle ? '<button class="ghost-button" data-action="open-pause-field-manual">Field Manual</button>' : ""}
                <button class="ghost-button" data-action="prompt-abandon-run">${isRunBattle ? "Forfeit Run" : "Back To Main Menu"}</button>
              </div>
            `
        }
      </div>
    </div>
  `;
}

export function renderRunCardsOverlay(state, battleSnapshot) {
  if (!state.battleUi?.runCardsOpen) {
    return "";
  }

  const ownedCardIds = state.runState?.ownedRunCardIds ?? battleSnapshot.runCards?.ownedCardIds ?? [];
  const ownedCards = ownedCardIds
    .map((cardId) => getRunUpgradeById(cardId))
    .filter((card) => card && !card.hidden);
  const { activeCards, gearCards } = describeRunCardsForState(battleSnapshot);
  const activeCardIds = new Set(activeCards.map((card) => card.id));
  const supersededCards = ownedCards.filter((card) => !activeCardIds.has(card.id));

  return `
    <div class="battle-overlay battle-overlay--run-cards">
      <div class="overlay-card overlay-card--run-cards">
        <div class="run-cards-overlay__header">
          <div>
            <p class="eyebrow">Run Cards</p>
            <h2>Owned Upgrades</h2>
          </div>
          <button class="ghost-button ghost-button--small" data-action="close-run-cards">Close</button>
        </div>
        <div class="run-cards-overlay__body">
          <section>
            <h3>Active Cards</h3>
            ${
              activeCards.length > 0
                ? `<ul class="run-card-list">${activeCards.map((card) => renderOwnedRunCardItem(card)).join("")}</ul>`
                : '<p class="run-cards-overlay__empty">No run cards are active.</p>'
            }
          </section>
          <section>
            <h3>Equipped Gear</h3>
            ${
              gearCards.length > 0
                ? `
                  <ul class="run-card-gear-list">
                    ${gearCards
                      .map((entry) => `
                        <li>
                          <strong>${entry.card.name}</strong>
                          <span>${escapeHtml(entry.unitName)}</span>
                        </li>
                      `)
                      .join("")}
                  </ul>
                `
                : '<p class="run-cards-overlay__empty">No squad gear is equipped.</p>'
            }
          </section>
          ${
            supersededCards.length > 0
              ? `
                <section>
                  <h3>Owned Lower Tiers</h3>
                  <ul class="run-card-list run-card-list--compact">
                    ${supersededCards
                      .map((card) => renderOwnedRunCardItem(card, { status: "superseded" }))
                      .join("")}
                  </ul>
                </section>
              `
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

export function renderOutcomeOverlay(state, battleSnapshot) {
  if (!battleSnapshot?.victory) {
    return "";
  }

  if (battleSnapshot.mode === BATTLE_MODES.TUTORIAL) {
    if (state.tutorial?.phase !== "lesson-complete") {
      return "";
    }

    const continueNewRun = state.tutorial?.returnIntent === "new-run"
      ? '<button class="menu-button" data-action="continue-new-run-from-tutorial">Continue to New Run</button>'
      : "";
    return `
      <div class="battle-overlay">
        <div class="overlay-card">
          <p class="eyebrow">Lesson Complete</p>
          <h2>${escapeHtml(state.tutorial?.activeLessonId?.replaceAll("-", " ") ?? "Training complete")}</h2>
          <p>Pip saved curriculum progress only. No run slot, Intel, unit EXP, unlock, or run record changed.</p>
          <div class="battle-actions">
            ${continueNewRun}
            <button class="menu-button" data-action="tutorial-epilogue">Tutorial Hub</button>
          </div>
        </div>
      </div>
    `;
  }

  if (battleSnapshot.victory.winner === TURN_SIDES.PLAYER && state.runStatus === "complete") {
    return `
      <div class="battle-overlay">
        <div class="overlay-card">
          <p class="eyebrow">Run Complete</p>
          <h2>Route Secured</h2>
          <p>${state.banner || "You cleared the current prototype goal."}</p>
          ${renderIntelBreakdown(state.runState)}
          <div class="battle-actions">
            <button class="menu-button" data-action="open-progression">Progression</button>
            <button class="ghost-button" data-action="back-to-title">Return To Title</button>
          </div>
        </div>
      </div>
    `;
  }

  if (battleSnapshot.victory.winner === TURN_SIDES.PLAYER) {
    if (state.runStatus === "reward") {
      const choices = state.runState?.pendingRewardChoices ?? [];
      return `
        <div class="battle-overlay">
          <div class="overlay-card overlay-card--run-reward">
            <p class="eyebrow">Battle Won</p>
            <h2>Choose An Upgrade</h2>
            <p>Select one reward before deploying to the next map.</p>
            <div class="battle-actions battle-actions--run-rewards">
              ${choices
                .map((choice) => renderRunRewardChoice(choice))
                .join("")}
            </div>
          </div>
        </div>
      `;
    }

    if (state.runStatus === "reward-name-unit") {
      const pending = state.runState?.pendingUnitNaming ?? null;
      const unit = pending
        ? (state.runState?.roster ?? []).find((candidate) => candidate.id === pending.unitId)
        : null;
      const unitType = UNIT_CATALOG[unit?.unitTypeId];
      const currentNameKey = getRunUnitNameKey(unit?.name);
      const excludedNames = unit
        ? [
            ...(state.runState?.unitNameHistory ?? []).filter(
              (name) => getRunUnitNameKey(name) !== currentNameKey
            ),
            ...(state.runState?.roster ?? [])
              .filter((candidate) => candidate.id !== unit.id)
              .map((candidate) => candidate.name)
          ]
        : [];
      const validation = validateRunUnitName(unit?.name, excludedNames);
      const sprite = unitType
        ? getUnitSpriteDefinition(unitType.id, TURN_SIDES.PLAYER, state.metaState?.options)
        : null;

      return `
        <div class="battle-overlay">
          <div class="overlay-card overlay-card--unit-naming" role="dialog" aria-modal="true" aria-labelledby="reinforcement-name-title">
            <p class="eyebrow">Reinforcement Acquired</p>
            <h2 id="reinforcement-name-title">Name Your ${escapeHtml(unitType?.name ?? "Unit")}</h2>
            <p>This name will stay with the unit for the rest of the run.</p>
            ${unit
              ? `
                <div class="reinforcement-naming-card">
                  ${sprite?.fallbackUrl
                    ? `<img src="${escapeHtmlAttribute(sprite.fallbackUrl)}" alt="${escapeHtmlAttribute(unitType?.name ?? "Unit")} preview" />`
                    : ""}
                  <div class="reinforcement-naming-card__type">
                    <strong>${escapeHtml(unitType?.name ?? unit.unitTypeId)}</strong>
                    <span>${escapeHtml(unit.family)}</span>
                  </div>
                  <label>
                    <span>Unit name</span>
                    <input
                      type="text"
                      value="${escapeHtmlAttribute(unit.name)}"
                      maxlength="24"
                      autocomplete="off"
                      spellcheck="false"
                      data-pending-run-unit-name
                      aria-invalid="${validation.valid ? "false" : "true"}"
                      aria-describedby="pending-run-unit-name-error"
                    />
                    <small id="pending-run-unit-name-error">${escapeHtml(validation.error)}</small>
                  </label>
                  <button class="ghost-button" data-action="randomize-pending-run-unit-name">Randomize</button>
                </div>
                <div class="battle-actions">
                  <button class="menu-button" data-action="confirm-pending-run-unit-name" ${validation.valid ? "" : "disabled"}>
                    Add To Squad And Continue
                  </button>
                </div>
              `
              : `<p>The drafted unit could not be found.</p>`}
          </div>
        </div>
      `;
    }

    if (state.runStatus === "reward-equip") {
      const pendingGearReward = state.runState?.pendingGearReward
        ? getRunUpgradeById(state.runState.pendingGearReward.id) ?? state.runState.pendingGearReward
        : null;
      const eligibleUnits = (state.runState?.roster ?? []).filter((unit) =>
        canUnitEquipRunUpgrade(unit, pendingGearReward)
      );

      return `
        <div class="battle-overlay">
          <div class="overlay-card">
            <p class="eyebrow">Battle Won</p>
            <h2>Equip ${pendingGearReward?.name ?? "Gear"}</h2>
            <p>${
              pendingGearReward?.summary ??
              "Choose a surviving squad unit to carry this gear into the next map."
            }</p>
            ${
              eligibleUnits.length > 0
                ? `
                  <div class="battle-actions battle-actions--stack">
                    ${eligibleUnits
                      .map((unit) => `
                        <button class="menu-button" data-action="equip-run-gear" data-unit-id="${unit.id}">
                          <strong>${escapeHtml(unit.name)}</strong><br />
                          <small>${escapeHtml(UNIT_CATALOG[unit.unitTypeId]?.name ?? unit.unitTypeId)} · Level ${unit.level}${unit.gear?.slot ? ` · Replaces ${escapeHtml(getRunUpgradeById(unit.gear.slot)?.name ?? unit.gear.slot)}` : ""}</small>
                        </button>
                      `)
                      .join("")}
                  </div>
                `
                : `
                  <p>No infantry survivors can equip this reward, so it will be lost if you continue.</p>
                `
            }
            <div class="battle-actions">
              <button class="ghost-button" data-action="discard-run-gear">${eligibleUnits.length > 0 ? "Skip Gear" : "Continue"}</button>
            </div>
          </div>
        </div>
      `;
    }

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
        <p>${
          battleSnapshot.rewardLedger?.forfeited
            ? "Your earned Intel Credits were preserved, but no map-clear reward was granted."
            : "The current save slot will be cleared when you return to the title screen."
        }</p>
        ${renderIntelBreakdown(state.runState)}
        <div class="battle-actions">
          <button class="menu-button" data-action="open-progression">Progression</button>
          <button class="ghost-button menu-button--danger" data-action="back-to-title">Return To Title</button>
        </div>
      </div>
    </div>
  `;
}
