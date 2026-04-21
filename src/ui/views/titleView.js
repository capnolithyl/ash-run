import { formatTurnCount } from "../formatters.js";

export function renderTitleView(state) {
  const hasContinue = state.slots.some((slot) => slot.exists);
  const latestClearTurnCount = state.metaState.latestClearTurnCount;
  const bestClearTurnCount = state.metaState.bestClearTurnCount;

  return `
    <div class="screen screen--title">
      <div class="title-scene" aria-hidden="true">
        <div class="title-scene__stars"></div>
        <div class="title-scene__sun"></div>
        <div class="title-scene__orb title-scene__orb--one"></div>
        <div class="title-scene__orb title-scene__orb--two"></div>
        <div class="title-scene__haze"></div>
        <div class="title-scene__mountains title-scene__mountains--far"></div>
        <div class="title-scene__mountains title-scene__mountains--near"></div>
        <div class="title-scene__grid"></div>
      </div>
      <section class="hero-card">
        <div class="hero-logo" aria-label="Ash Run logo">
          <div class="hero-logo__sun" aria-hidden="true"></div>
          <h1 class="hero-logo__title">ASH RUN</h1>
        </div>
        <div class="menu-stack">
          <button class="menu-button" data-action="open-new-run">New Run</button>
          <button class="menu-button" data-action="open-debug-run">Debug Mode</button>
          <button
            class="menu-button"
            data-action="open-continue"
            ${hasContinue ? "" : "disabled"}
          >
            Continue
          </button>
          <button class="menu-button" data-action="open-options">Options</button>
          <button class="menu-button menu-button--danger" data-action="quit-game">
            Return To Windows
          </button>
        </div>
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
        <div class="title-run-stats">
          <p class="eyebrow">LTC Records</p>
          <p><strong>Latest Clear:</strong> ${formatTurnCount(latestClearTurnCount)}</p>
          <p><strong>Best Clear:</strong> ${formatTurnCount(bestClearTurnCount)}</p>
        </div>
        <p class="footer-note">
          Prototype goal: clear 10 maps in a row. Locked commanders remain in the enemy pool until unlocked.
        </p>
>>>>>>> theirs
      </section>
    </div>
  `;
}
