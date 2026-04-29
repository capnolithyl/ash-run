import { formatTurnCount } from "../formatters.js";

function renderTitleIcon(iconName) {
  switch (iconName) {
    case "continue":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M7 6v12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
      `;
    case "skirmish":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7l10 10" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
          <path d="M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
          <path d="M6 6l2 1-1 2-2-1zM16 15l2 1-1 2-2-1zM15 6l2 1-1 2-2-1zM6 15l2 1-1 2-2-1z" fill="currentColor"/>
        </svg>
      `;
    case "new-run":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
        </svg>
      `;
    case "tutorial":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5.5h8.5a3.5 3.5 0 013.5 3.5v9.5H9.5A3.5 3.5 0 006 22z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M6 5.5h8.5a3.5 3.5 0 013.5 3.5v9.5H9.5A3.5 3.5 0 006 22z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" transform="translate(-1.5 -1.5) scale(.88)"/>
        </svg>
      `;
    case "sandbox":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4l7 4v8l-7 4-7-4V8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M12 4v16M5 8l7 4 7-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      `;
    case "options":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.5l1.5 1 .2 1.8 1.6.7 1.7-.7 1.4 1.4-.7 1.7.7 1.6 1.8.2 1 1.5-1 1.5-1.8.2-.7 1.6.7 1.7-1.4 1.4-1.7-.7-1.6.7-.2 1.8-1.5 1-1.5-1-.2-1.8-1.6-.7-1.7.7-1.4-1.4.7-1.7-.7-1.6-1.8-.2-1-1.5 1-1.5 1.8-.2.7-1.6-.7-1.7 1.4-1.4 1.7.7 1.6-.7.2-1.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="2"/>
        </svg>
      `;
    case "progression":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5l2.6 5.2 5.8.8-4.2 4.1 1 5.9-5.2-2.7-5.2 2.7 1-5.9-4.2-4.1 5.8-.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M12 8.8l1.2 2.3 2.5.4-1.8 1.8.4 2.5-2.3-1.2-2.3 1.2.4-2.5-1.8-1.8 2.5-.4z" fill="currentColor"/>
        </svg>
      `;
    case "quit":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M5 5h14v14H5z" fill="none" stroke="currentColor" stroke-width="1.6" rx="2"/>
        </svg>
      `;
    default:
      return "";
  }
}

function renderTitleButton({
  action,
  className,
  label,
  icon,
  disabled = false,
  iconOnly = false,
  ariaLabel = label
}) {
  return `
    <button
      class="menu-button ${className}"
      data-action="${action}"
      aria-label="${ariaLabel}"
      ${disabled ? "disabled" : ""}
    >
      <span class="title-button__content">
        <span class="title-button__icon">${renderTitleIcon(icon)}</span>
        ${iconOnly ? "" : `<span class="title-button__label">${label}</span>`}
      </span>
    </button>
  `;
}

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
      <section class="hero-card title-card" aria-labelledby="title-screen-heading">
        ${renderTitleButton({
          action: "open-options",
          className: "ghost-button title-utility-button",
          label: "Options",
          icon: "options",
          iconOnly: true
        })}
        <div class="hero-logo" aria-label="Ash Run '84 logo">
          <div class="hero-logo__sun" aria-hidden="true"></div>
          <h1 class="hero-logo__title" id="title-screen-heading">ASH RUN '84</h1>
        </div>
        <nav class="title-orbit" aria-label="Main menu">
          ${renderTitleButton({
            action: "open-progression",
            className: "title-orbit__button title-orbit__button--progression",
            label: "Progression",
            icon: "progression"
          })}
          ${renderTitleButton({
            action: "open-continue",
            className: "title-orbit__button title-orbit__button--continue",
            label: "Continue",
            icon: "continue",
            disabled: !hasContinue
          })}
          ${renderTitleButton({
            action: "open-skirmish",
            className: "title-orbit__button title-orbit__button--skirmish",
            label: "Skirmish",
            icon: "skirmish"
          })}
          ${renderTitleButton({
            action: "open-new-run",
            className: "title-orbit__button title-orbit__button--new-run",
            label: "New Run",
            icon: "new-run"
          })}
          ${renderTitleButton({
            action: "open-tutorial",
            className: "title-orbit__button title-orbit__button--tutorial",
            label: "Tutorial",
            icon: "tutorial"
          })}
          ${renderTitleButton({
            action: "open-debug-run",
            className: "title-orbit__button title-orbit__button--sandbox",
            label: "Sandbox",
            icon: "sandbox"
          })}
        </nav>
        <div class="title-run-stats">
          <p class="eyebrow">LTC Records</p>
          <p><strong>Latest Clear:</strong> ${formatTurnCount(latestClearTurnCount)}</p>
          <p><strong>Best Clear:</strong> ${formatTurnCount(bestClearTurnCount)}</p>
        </div>
        <div class="title-bottom-action">
          ${renderTitleButton({
            action: "quit-game",
            className: "menu-button--danger title-bottom-action__button",
            label: "Quit Game",
            icon: "quit"
          })}
        </div>
      </section>
    </div>
  `;
}
