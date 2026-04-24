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
      <section class="title-menu-shell" aria-labelledby="title-screen-heading">
        <div class="hero-logo" aria-label="Ash Run '84 logo">
          <div class="hero-logo__sun" aria-hidden="true"></div>
          <h1 class="hero-logo__title" id="title-screen-heading">ASH RUN '84</h1>
        </div>
        <nav class="title-mode-cluster" aria-label="Main menu">
          <button class="menu-button hex-button hex-button--primary hex-button--new-run" data-action="open-new-run">
            <span>New Run</span>
          </button>
          <button
            class="menu-button hex-button hex-button--continue"
            data-action="open-continue"
            ${hasContinue ? "" : "disabled"}
          >
            <span>Continue</span>
          </button>
          <button class="menu-button hex-button hex-button--skirmish" data-action="open-skirmish">
            <span>Skirmish</span>
          </button>
          <button class="menu-button hex-button hex-button--tutorial" data-action="open-tutorial">
            <span>Tutorial</span>
          </button>
          <button class="menu-button hex-button hex-button--debug" data-action="open-debug-run">
            <span>Debug</span>
          </button>
        </nav>
        <div class="title-run-stats">
          <p class="eyebrow">LTC Records</p>
          <p><strong>Latest Clear:</strong> ${formatTurnCount(latestClearTurnCount)}</p>
          <p><strong>Best Clear:</strong> ${formatTurnCount(bestClearTurnCount)}</p>
        </div>
        <nav class="title-bottom-bar" aria-label="Game utilities">
          <button class="menu-button hex-button hex-button--utility" data-action="open-options">
            <span>Options</span>
          </button>
          <button class="menu-button hex-button hex-button--utility hex-button--danger" data-action="quit-game">
            <span>Exit</span>
          </button>
        </nav>
      </section>
    </div>
  `;
}
