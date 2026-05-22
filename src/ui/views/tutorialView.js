import { TUTORIAL_EPILOGUE_CARDS } from "../../game/content/tutorial.js";

function renderTutorialBackdrop() {
  return `
    <div class="title-scene tutorial-scene" aria-hidden="true">
      <div class="title-scene__stars"></div>
      <div class="title-scene__sun"></div>
      <div class="title-scene__orb title-scene__orb--one"></div>
      <div class="title-scene__orb title-scene__orb--two"></div>
      <div class="title-scene__haze"></div>
      <div class="title-scene__mountains title-scene__mountains--far"></div>
      <div class="title-scene__mountains title-scene__mountains--near"></div>
      <div class="title-scene__grid"></div>
    </div>
  `;
}

function renderMascotBadge() {
  return `
    <div class="tutorial-mascot-card" aria-label="Pip, tutorial guide">
      <div class="tutorial-mascot-card__portrait" aria-hidden="true">
        <span>Pip</span>
      </div>
      <div>
        <p class="eyebrow">Mascot Uplink</p>
        <strong>Pip the tactical gremlin</strong>
        <span>Placeholder guide art until the real asset arrives.</span>
      </div>
    </div>
  `;
}

function renderIntroView() {
  return `
    <section class="panel panel--static tutorial-panel tutorial-panel--intro">
      <div class="panel-header tutorial-header">
        <div>
          <p class="eyebrow">Training Sim</p>
          <h2>Guided Match</h2>
          <p>Pip will walk you through a short Atlas training battle against the AI.</p>
        </div>
        <button class="ghost-button" data-action="back-to-title">Back</button>
      </div>

      <div class="tutorial-hero">
        ${renderMascotBadge()}
        <div class="tutorial-brief">
          <h3>You play. Pip nudges.</h3>
          <p>
            This is a real battle using normal movement, attacks, captures, forecasts, enemy turns,
            and commander powers. Wrong clicks are blocked gently so the lesson stays short.
          </p>
          <div class="tutorial-brief__chips" aria-label="Tutorial topics">
            <span>Units</span>
            <span>Matchups</span>
            <span>Buildings</span>
            <span>Commander Powers</span>
            <span>Run Mode</span>
          </div>
        </div>
      </div>

      <div class="panel-footer tutorial-footer">
        <span>No save slots, Intel, unlocks, or run progress are touched.</span>
        <button class="menu-button" data-action="start-tutorial">Start Training</button>
      </div>
    </section>
  `;
}

function renderEpilogueCards() {
  return TUTORIAL_EPILOGUE_CARDS.map(
    (card) => `
      <article class="tutorial-epilogue-card">
        <h3>${card.title}</h3>
        <p>${card.body}</p>
      </article>
    `
  ).join("");
}

function renderEpilogueView() {
  return `
    <section class="panel panel--static tutorial-panel tutorial-panel--epilogue">
      <div class="panel-header tutorial-header">
        <div>
          <p class="eyebrow">Training Complete</p>
          <h2>Field Notes</h2>
          <p>Short version: preserve survivors, read the goal, spend upgrades with a plan, and use powers before they become souvenirs.</p>
        </div>
        <button class="ghost-button" data-action="back-to-title">Back</button>
      </div>

      <div class="tutorial-epilogue-grid">
        ${renderEpilogueCards()}
      </div>

      <div class="panel-footer tutorial-footer">
        <span>Replay the guided match whenever you want a quick refresher.</span>
        <div class="battle-actions">
          <button class="menu-button" data-action="start-tutorial">Replay Training</button>
          <button class="ghost-button" data-action="open-new-run">Start A Run</button>
        </div>
      </div>
    </section>
  `;
}

export function renderTutorialView(state = {}) {
  const tutorialPhase = state.tutorial?.phase ?? "intro";

  return `
    <div class="screen screen--tutorial" data-screen-id="tutorial">
      ${renderTutorialBackdrop()}
      ${tutorialPhase === "epilogue" ? renderEpilogueView() : renderIntroView()}
    </div>
  `;
}
