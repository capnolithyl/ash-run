import { buildFieldManual } from "../../game/content/fieldManual.js";
import { TUTORIAL_LESSONS } from "../../game/content/tutorialCurriculum.js";
import { TUTORIAL_TABS } from "../../game/content/tutorialConstants.js";
import { normalizeTutorialProgress } from "../../game/state/tutorialProgress.js";
import { escapeHtml, escapeHtmlAttribute } from "../shared/html.js";

const MANUAL_FILTERS = [
  ["all", "All"],
  ["units", "Units"],
  ["weapons", "Weapons"],
  ["terrain", "Terrain"],
  ["buildings", "Buildings"],
  ["missions", "Missions"],
  ["commanders", "Commanders"],
  ["statuses", "Statuses"],
  ["progression", "Progression"],
  ["run-upgrades", "Cards & Gear"],
  ["reinforcements", "Reinforcements"]
];

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

function renderLessonCard(lesson, progress) {
  const unlocked = progress.unlockedLessonIds.includes(lesson.id);
  const completed = progress.completedLessonIds.includes(lesson.id);
  const status = completed ? "Completed · Replayable" : unlocked ? "Ready" : "Locked";
  return `
    <article class="tutorial-lesson-card${completed ? " tutorial-lesson-card--complete" : ""}${unlocked ? "" : " tutorial-lesson-card--locked"}">
      <div class="tutorial-lesson-card__number" aria-hidden="true">${lesson.order}</div>
      <div class="tutorial-lesson-card__copy">
        <p class="eyebrow">Lesson ${lesson.order} · ${escapeHtml(lesson.duration)}</p>
        <h3>${escapeHtml(lesson.title)}</h3>
        <p>${escapeHtml(lesson.summary)}</p>
        <div class="tutorial-lesson-card__topics" aria-label="Topics">
          ${lesson.topics.map((topic) => `<span>${escapeHtml(topic)}</span>`).join("")}
        </div>
      </div>
      <div class="tutorial-lesson-card__action">
        <span class="tutorial-lesson-status">${escapeHtml(status)}</span>
        <button
          class="${completed ? "ghost-button" : "menu-button"} menu-button--small"
          data-action="start-tutorial-lesson"
          data-lesson-id="${escapeHtmlAttribute(lesson.id)}"
          ${unlocked ? "" : "disabled"}
        >${completed ? "Replay" : "Start"}</button>
      </div>
    </article>
  `;
}

function renderGuidedTraining(state) {
  const progress = normalizeTutorialProgress(state.metaState?.tutorial);
  const completedCount = progress.completedLessonIds.length;
  return `
    <section class="tutorial-hub-panel" id="tutorial-panel-guided" role="tabpanel" aria-labelledby="tutorial-tab-guided">
      <div class="tutorial-curriculum-summary">
        <div>
          <p class="eyebrow">Guided Curriculum</p>
          <h3>${completedCount}/6 lessons complete</h3>
          <p>Short, real-rule simulations. Lessons unlock in order and remain replayable.</p>
        </div>
        <div class="tutorial-progress-meter" aria-label="${completedCount} of 6 lessons complete">
          <span style="--tutorial-progress:${completedCount / TUTORIAL_LESSONS.length}"></span>
        </div>
      </div>
      <div class="tutorial-lesson-list">
        ${TUTORIAL_LESSONS.map((lesson) => renderLessonCard(lesson, progress)).join("")}
      </div>
    </section>
  `;
}

function manualSearchText(manualSection, manualEntry) {
  return [
    manualSection.title,
    manualEntry.title,
    manualEntry.summary,
    ...manualEntry.details,
    ...manualEntry.tags,
    ...manualEntry.aliases
  ].join(" ").toLowerCase();
}

function renderManualEntry(manualSection, manualEntry) {
  return `
    <details
      class="field-manual-entry"
      data-manual-entry
      data-manual-section-id="${escapeHtmlAttribute(manualSection.id)}"
      data-manual-tags="${escapeHtmlAttribute(manualEntry.tags.join(" "))}"
      data-manual-search-text="${escapeHtmlAttribute(manualSearchText(manualSection, manualEntry))}"
    >
      <summary>
        <span>${escapeHtml(manualEntry.title)}</span>
        <small>${escapeHtml(manualEntry.summary)}</small>
      </summary>
      <div class="field-manual-entry__body">
        ${manualEntry.details.map((detail) => `<p>${escapeHtml(detail)}</p>`).join("")}
      </div>
    </details>
  `;
}

function renderFieldManual({ compact = false } = {}) {
  const sections = buildFieldManual();
  const entryCount = sections.reduce((count, manualSection) => count + manualSection.entries.length, 0);
  return `
    <div class="field-manual${compact ? " field-manual--compact" : ""}" data-field-manual>
      <div class="field-manual-tools">
        <label class="field-manual-search">
          <span>Search the manual</span>
          <input type="search" data-manual-query placeholder="Search units, rules, missions…" autocomplete="off" />
        </label>
        <div class="field-manual-filters" aria-label="Manual filters">
          ${MANUAL_FILTERS.map(([id, label], index) => `
            <button
              class="ghost-button ghost-button--small${index === 0 ? " field-manual-filter--active" : ""}"
              data-action="filter-field-manual"
              data-manual-filter="${id}"
              aria-pressed="${index === 0}"
            >${escapeHtml(label)}</button>
          `).join("")}
        </div>
        <p class="field-manual-results" data-manual-results role="status" aria-live="polite">${entryCount} entries</p>
      </div>
      <div class="field-manual-sections">
        ${sections.map((manualSection) => `
          <section class="field-manual-section" data-manual-section>
            <header>
              <p class="eyebrow">Field Manual</p>
              <h3>${escapeHtml(manualSection.title)}</h3>
              <p>${escapeHtml(manualSection.summary)}</p>
            </header>
            <div class="field-manual-section__entries">
              ${manualSection.entries.map((manualEntry) => renderManualEntry(manualSection, manualEntry)).join("")}
            </div>
          </section>
        `).join("")}
        <p class="field-manual-empty" data-manual-empty hidden>No manual entries match that search and filter.</p>
      </div>
    </div>
  `;
}

export function renderFieldManualPanel(options = {}) {
  return renderFieldManual(options);
}

export function renderTutorialView(state = {}) {
  const activeTab = state.tutorial?.activeTab === TUTORIAL_TABS.MANUAL
    ? TUTORIAL_TABS.MANUAL
    : TUTORIAL_TABS.GUIDED;
  const returningToNewRun = state.tutorial?.returnIntent === "new-run";

  return `
    <div class="screen screen--tutorial" data-screen-id="tutorial">
      ${renderTutorialBackdrop()}
      <section class="panel panel--static tutorial-panel tutorial-panel--hub" aria-labelledby="tutorial-hub-title">
        <div class="panel-header tutorial-header">
          <div>
            <p class="eyebrow">Training Sim & Field Reference</p>
            <h2 id="tutorial-hub-title">Tutorial Hub</h2>
            <p>${returningToNewRun ? "Complete a lesson or use Continue to New Run whenever you are ready." : "Train with Pip or look up the current rules without touching a run save."}</p>
          </div>
          <button class="ghost-button" data-action="back-to-title">Main Menu</button>
        </div>

        <div class="tutorial-hub-tabs" role="tablist" aria-label="Tutorial Hub">
          <button id="tutorial-tab-guided" role="tab" data-action="select-tutorial-tab" data-tutorial-tab="guided" aria-controls="tutorial-panel-guided" aria-selected="${activeTab === TUTORIAL_TABS.GUIDED}" tabindex="${activeTab === TUTORIAL_TABS.GUIDED ? 0 : -1}" class="tutorial-hub-tab${activeTab === TUTORIAL_TABS.GUIDED ? " tutorial-hub-tab--active" : ""}">Guided Training</button>
          <button id="tutorial-tab-manual" role="tab" data-action="select-tutorial-tab" data-tutorial-tab="manual" aria-controls="tutorial-panel-manual" aria-selected="${activeTab === TUTORIAL_TABS.MANUAL}" tabindex="${activeTab === TUTORIAL_TABS.MANUAL ? 0 : -1}" class="tutorial-hub-tab${activeTab === TUTORIAL_TABS.MANUAL ? " tutorial-hub-tab--active" : ""}">Field Manual</button>
        </div>

        ${activeTab === TUTORIAL_TABS.GUIDED
          ? renderGuidedTraining(state)
          : `<section class="tutorial-hub-panel" id="tutorial-panel-manual" role="tabpanel" aria-labelledby="tutorial-tab-manual">${renderFieldManual()}</section>`}

        <div class="panel-footer tutorial-footer">
          <span>No run slots, Intel, unit EXP, unlocks, or run records are changed by lessons.</span>
          ${returningToNewRun ? '<button class="menu-button" data-action="continue-new-run-from-tutorial">Continue to New Run</button>' : ""}
        </div>
      </section>
    </div>
  `;
}
