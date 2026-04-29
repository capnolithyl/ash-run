import { BATTLE_NOTICE_DISPLAY_MS, TURN_SIDES } from "../../../game/core/constants.js";
import { renderOptionFields } from "../optionFieldsView.js";
import { renderDebugControls } from "./interactionPanels.js";

export function renderLevelUpOverlay(battleSnapshot) {
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
          <button class="menu-button" data-action="back-to-title">Return To Title</button>
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
