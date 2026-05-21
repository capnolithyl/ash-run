import { BATTLE_NOTICE_DISPLAY_MS, TURN_SIDES } from "../../../game/core/constants.js";
import {
  canUnitEquipRunUpgrade,
  getRunUpgradeById
} from "../../../game/content/runUpgrades.js";
import { getUnitSpriteDefinition } from "../../../game/phaser/assets.js";
import { renderOptionFields } from "../optionFieldsView.js";
import { renderDebugControls } from "./interactionPanels.js";

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

function getStaticSpriteSheetPosition(frameIndex, columns, rows) {
  const resolvedColumns = Math.max(1, columns);
  const resolvedRows = Math.max(1, rows);
  const column = Math.max(0, frameIndex % resolvedColumns);
  const row = Math.max(0, Math.floor(frameIndex / resolvedColumns));
  const x = resolvedColumns > 1 ? `${((column / (resolvedColumns - 1)) * 100).toFixed(4)}%` : "0%";
  const y = resolvedRows > 1 ? `${((row / (resolvedRows - 1)) * 100).toFixed(4)}%` : "0%";

  return { x, y };
}

function renderLevelUpUnitArt(levelUpEvent) {
  const spriteDefinition = getUnitSpriteDefinition(levelUpEvent.unitTypeId, levelUpEvent.owner);
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
      <span>${levelUpEvent.unitName.slice(0, 2).toUpperCase()}</span>
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

export function renderLevelUpOverlay(battleSnapshot, presentation = null) {
  const levelUpEvent = battleSnapshot.levelUpQueue?.[0];

  if (!levelUpEvent) {
    return "";
  }

  const resolvedPresentation = presentation ?? buildFinalLevelUpPresentation(levelUpEvent);
  const rows = resolvedPresentation.rows ?? [];
  const continueEnabled = resolvedPresentation.continueEnabled !== false;
  const levelUpKey = `${levelUpEvent.unitId}-${levelUpEvent.previousLevel}-${levelUpEvent.newLevel}`;

  return `
    <div class="battle-overlay battle-overlay--level-up" data-level-up-key="${levelUpKey}">
      <div class="overlay-card overlay-card--level-up${continueEnabled ? " overlay-card--level-up-ready" : ""}">
        <div class="level-up-card__header">
          <p class="eyebrow">Level Up</p>
          <h2>${levelUpEvent.unitName}</h2>
          <p>Level ${levelUpEvent.previousLevel} to ${levelUpEvent.newLevel}</p>
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
          ${renderLevelUpUnitArt(levelUpEvent)}
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

export function renderPowerOverlay(powerOverlay) {
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

export function renderPauseOverlay(state, battleSnapshot) {
  if (!state.battleUi.pauseMenuOpen) {
    return "";
  }

  const confirmingExit = state.battleUi.confirmAbandon;
  const isRunBattle = Boolean(state.runState) && !state.debugMode;

  return `
    <div class="battle-overlay battle-overlay--pause">
      <div class="overlay-card overlay-card--pause">
        <p class="eyebrow">Paused</p>
        <h2>Battle Intermission</h2>
        ${
          confirmingExit
            ? `
              <div class="pause-warning">
                <p>${isRunBattle ? "Forfeit this run?" : "Return to the main menu?"}</p>
                <p>${
                  isRunBattle
                    ? "The battle will count as a loss. Earned Intel Credits stay banked, but you will not get a map-clear payout."
                    : "The active battle will be discarded when you leave this screen."
                }</p>
              </div>
              <div class="battle-actions">
                <button class="menu-button menu-button--danger" data-action="confirm-abandon-run">${isRunBattle ? "Forfeit Run" : "Return To Main Menu"}</button>
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
                <button class="ghost-button" data-action="prompt-abandon-run">${isRunBattle ? "Forfeit Run" : "Back To Main Menu"}</button>
              </div>
            `
        }
      </div>
    </div>
  `;
}

export function renderOutcomeOverlay(state, battleSnapshot) {
  if (!battleSnapshot?.victory) {
    return "";
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
          <div class="overlay-card">
            <p class="eyebrow">Battle Won</p>
            <h2>Choose An Upgrade</h2>
            <p>Select one reward before deploying to the next map.</p>
            <div class="battle-actions battle-actions--stack">
              ${choices
                .map(
                  (choice) => `
                    <button class="menu-button" data-action="select-run-reward" data-reward-id="${choice.id}">
                      <strong>${choice.name}</strong><br />
                      <small>${choice.summary}</small>
                    </button>
                  `
                )
                .join("")}
            </div>
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
                          <strong>${unit.name}</strong><br />
                          <small>Level ${unit.level}${unit.gear?.slot ? ` | Replaces ${getRunUpgradeById(unit.gear.slot)?.name ?? unit.gear.slot}` : ""}</small>
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
