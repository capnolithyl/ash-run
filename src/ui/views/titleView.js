import { formatTurnCount } from "../formatters.js";

function renderTitleIcon(iconName) {
  switch (iconName) {
    case "continue":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ashrun-neon-continue" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6EF3FF"/>
      <stop offset="38%" stop-color="#7A8CFF"/>
      <stop offset="70%" stop-color="#B56CFF"/>
      <stop offset="100%" stop-color="#FF6FD8"/>
    </linearGradient>
  </defs>

  <!-- soft neon aura -->
  <path
    d="M7 5v14"
    stroke="url(#ashrun-neon-continue)"
    stroke-width="4"
    stroke-linecap="round"
    opacity="0.18"
  />
  <path
    d="M10 6l7 6-7 6"
    stroke="url(#ashrun-neon-continue)"
    stroke-width="4"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.18"
  />

  <!-- bright core -->
  <path
    d="M7 5v14"
    stroke="url(#ashrun-neon-continue)"
    stroke-width="2.3"
    stroke-linecap="round"
  />
  <path
    d="M10 6l7 6-7 6"
    stroke="url(#ashrun-neon-continue)"
    stroke-width="2.3"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- inner highlight -->
  <path
    d="M7 5.8v12.4"
    stroke="#DDFBFF"
    stroke-width="0.65"
    stroke-linecap="round"
    opacity="0.75"
  />
  <path
    d="M10.8 7.1l5.7 4.9-5.7 4.9"
    stroke="#F4E9FF"
    stroke-width="0.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.65"
  />
</svg>
      `;
    case "skirmish":
      return `
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ashrun-neon-skirmish" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6EF3FF"/>
      <stop offset="38%" stop-color="#7A8CFF"/>
      <stop offset="70%" stop-color="#B56CFF"/>
      <stop offset="100%" stop-color="#FF6FD8"/>
    </linearGradient>
  </defs>

  <!-- soft glow -->
  <path
    d="M6 6l12 12M18 6L6 18"
    stroke="url(#ashrun-neon-skirmish)"
    stroke-width="4"
    stroke-linecap="round"
    opacity="0.18"
  />

  <!-- main strokes -->
  <path
    d="M6.5 6.5l11 11M17.5 6.5l-11 11"
    stroke="url(#ashrun-neon-skirmish)"
    stroke-width="2.4"
    stroke-linecap="round"
  />

  <!-- impact notch (subtle break for “clash” feel) -->
  <path
    d="M11 11l2 2"
    stroke="#FFFFFF"
    stroke-width="1.2"
    stroke-linecap="round"
    opacity="0.7"
  />

  <!-- inner highlight -->
  <path
    d="M7.5 7.5l9 9M16.5 7.5l-9 9"
    stroke="#DDFBFF"
    stroke-width="0.6"
    stroke-linecap="round"
    opacity="0.6"
  />
</svg>
      `;
    case "new-run":
      return `
       <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ashrun-neon-newrun" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6EF3FF"/>
      <stop offset="38%" stop-color="#7A8CFF"/>
      <stop offset="70%" stop-color="#B56CFF"/>
      <stop offset="100%" stop-color="#FF6FD8"/>
    </linearGradient>
  </defs>

  <!-- soft neon aura -->
  <path
    d="M12 4.8v14.4M4.8 12h14.4"
    stroke="url(#ashrun-neon-newrun)"
    stroke-width="4"
    stroke-linecap="round"
    opacity="0.18"
  />
  <path
    d="M8.3 8.3l7.4 7.4M15.7 8.3l-7.4 7.4"
    stroke="url(#ashrun-neon-newrun)"
    stroke-width="3"
    stroke-linecap="round"
    opacity="0.14"
  />

  <!-- bright core -->
  <path
    d="M12 5.2v13.6M5.2 12h13.6"
    stroke="url(#ashrun-neon-newrun)"
    stroke-width="2.2"
    stroke-linecap="round"
  />
  <path
    d="M8.7 8.7l6.6 6.6M15.3 8.7l-6.6 6.6"
    stroke="url(#ashrun-neon-newrun)"
    stroke-width="1.5"
    stroke-linecap="round"
    opacity="0.85"
  />

  <!-- center ignition dot -->
  <circle
    cx="12"
    cy="12"
    r="2.1"
    fill="url(#ashrun-neon-newrun)"
    opacity="0.95"
  />

  <!-- inner highlight -->
  <path
    d="M12 6.2v11.6M6.2 12h11.6"
    stroke="#DDFBFF"
    stroke-width="0.55"
    stroke-linecap="round"
    opacity="0.7"
  />
  <circle
    cx="11.35"
    cy="11.35"
    r="0.55"
    fill="#F4E9FF"
    opacity="0.85"
  />
</svg>
      `;
    case "tutorial":
      return `
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ashrun-neon-tutorial" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6EF3FF"/>
      <stop offset="38%" stop-color="#7A8CFF"/>
      <stop offset="70%" stop-color="#B56CFF"/>
      <stop offset="100%" stop-color="#FF6FD8"/>
    </linearGradient>
  </defs>

  <!-- soft glow -->
  <path
    d="M5.5 6.5h9a2 2 0 0 1 2 2v5.5a2 2 0 0 1-2 2h-4l-3.5 3v-3h-1a2 2 0 0 1-2-2v-5.5a2 2 0 0 1 2-2z"
    stroke="url(#ashrun-neon-tutorial)"
    stroke-width="3.8"
    stroke-linejoin="round"
    opacity="0.16"
  />

  <!-- main panel -->
  <path
    d="M5.8 6.8h8.4a1.6 1.6 0 0 1 1.6 1.6v5a1.6 1.6 0 0 1-1.6 1.6h-3.6l-2.8 2.4v-2.4h-.9a1.6 1.6 0 0 1-1.6-1.6v-5a1.6 1.6 0 0 1 1.6-1.6z"
    stroke="url(#ashrun-neon-tutorial)"
    stroke-width="2"
    stroke-linejoin="round"
  />

  <!-- instruction lines -->
  <path
    d="M7.5 9.5h5M7.5 11.5h4"
    stroke="url(#ashrun-neon-tutorial)"
    stroke-width="1.6"
    stroke-linecap="round"
    opacity="0.9"
  />

  <!-- prompt arrow (feels interactive) -->
  <path
    d="M13.5 10l1.8 1.5-1.8 1.5"
    stroke="url(#ashrun-neon-tutorial)"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- inner highlights -->
  <path
    d="M6.5 7.6h6.5"
    stroke="#DDFBFF"
    stroke-width="0.5"
    stroke-linecap="round"
    opacity="0.6"
  />
</svg>
      `;
    case "map-editor":
      return `
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ashrun-neon-mapeditor" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6EF3FF"/>
      <stop offset="38%" stop-color="#7A8CFF"/>
      <stop offset="70%" stop-color="#B56CFF"/>
      <stop offset="100%" stop-color="#FF6FD8"/>
    </linearGradient>
  </defs>

  <!-- soft neon aura -->
  <path
    d="M5 6.5l4.7-2 4.6 2 4.7-2v13l-4.7 2-4.6-2-4.7 2v-13z"
    stroke="url(#ashrun-neon-mapeditor)"
    stroke-width="3.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.16"
  />
  <path
    d="M9.7 4.5v13M14.3 6.5v13"
    stroke="url(#ashrun-neon-mapeditor)"
    stroke-width="3"
    stroke-linecap="round"
    opacity="0.12"
  />

  <!-- main map outline -->
  <path
    d="M5 6.5l4.7-2 4.6 2 4.7-2v13l-4.7 2-4.6-2-4.7 2v-13z"
    stroke="url(#ashrun-neon-mapeditor)"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- fold lines -->
  <path
    d="M9.7 4.5v13M14.3 6.5v13"
    stroke="url(#ashrun-neon-mapeditor)"
    stroke-width="1.6"
    stroke-linecap="round"
    opacity="0.9"
  />

  <!-- small edit node / cursor mark -->
  <path
    d="M7.2 15.2l2.1-2.1 1.6 1.6-2.1 2.1-1.9.3.3-1.9z"
    fill="url(#ashrun-neon-mapeditor)"
    opacity="0.95"
  />

  <!-- inner highlights -->
  <path
    d="M5.9 7.1l3.4-1.45M15 7.3l3.1-1.35"
    stroke="#DDFBFF"
    stroke-width="0.55"
    stroke-linecap="round"
    opacity="0.65"
  />
  <path
    d="M7.55 15.35l1.8-1.8"
    stroke="#F4E9FF"
    stroke-width="0.55"
    stroke-linecap="round"
    opacity="0.8"
  />
</svg>
      `;
    case "sandbox":
      return `
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ashrun-neon-sandbox" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6EF3FF"/>
      <stop offset="38%" stop-color="#7A8CFF"/>
      <stop offset="70%" stop-color="#B56CFF"/>
      <stop offset="100%" stop-color="#FF6FD8"/>
    </linearGradient>
  </defs>

  <!-- soft neon aura -->
  <path
    d="M12 4.5l6.5 3.5v7.8L12 19.5l-6.5-3.7V8L12 4.5z"
    stroke="url(#ashrun-neon-sandbox)"
    stroke-width="3.8"
    stroke-linejoin="round"
    opacity="0.16"
  />
  <path
    d="M5.8 8.2l6.2 3.5 6.2-3.5M12 11.7v7.2"
    stroke="url(#ashrun-neon-sandbox)"
    stroke-width="3"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.12"
  />

  <!-- main cube -->
  <path
    d="M12 4.8l6.2 3.4v7.3L12 19.1l-6.2-3.6V8.2L12 4.8z"
    stroke="url(#ashrun-neon-sandbox)"
    stroke-width="2"
    stroke-linejoin="round"
  />

  <!-- inner cube lines -->
  <path
    d="M5.8 8.2l6.2 3.5 6.2-3.5M12 11.7v7.2"
    stroke="url(#ashrun-neon-sandbox)"
    stroke-width="1.55"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.95"
  />

  <!-- small test node -->
  <circle
    cx="12"
    cy="11.7"
    r="1.35"
    fill="url(#ashrun-neon-sandbox)"
    opacity="0.95"
  />

  <!-- inner highlights -->
  <path
    d="M12 5.8l4.8 2.6"
    stroke="#DDFBFF"
    stroke-width="0.55"
    stroke-linecap="round"
    opacity="0.65"
  />
  <circle
    cx="11.55"
    cy="11.25"
    r="0.38"
    fill="#F4E9FF"
    opacity="0.85"
  />
</svg>
      `;
    case "options":
      return `
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ashrun-neon-options" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6EF3FF"/>
      <stop offset="38%" stop-color="#7A8CFF"/>
      <stop offset="70%" stop-color="#B56CFF"/>
      <stop offset="100%" stop-color="#FF6FD8"/>
    </linearGradient>
  </defs>

  <!-- soft glow -->
  <path
    d="M12 5.2l1.2 1.3 1.9-.2.7 1.7 1.7.7-.2 1.9 1.3 1.2-1.3 1.2.2 1.9-1.7.7-.7 1.7-1.9-.2-1.2 1.3-1.2-1.3-1.9.2-.7-1.7-1.7-.7.2-1.9-1.3-1.2 1.3-1.2-.2-1.9 1.7-.7.7-1.7 1.9.2 1.2-1.3z"
    stroke="url(#ashrun-neon-options)"
    stroke-width="4"
    stroke-linejoin="round"
    opacity="0.16"
  />

  <!-- main gear -->
  <path
    d="M12 5.5l1 1.1 1.6-.2.6 1.4 1.4.6-.2 1.6 1.1 1-1.1 1 .2 1.6-1.4.6-.6 1.4-1.6-.2-1 1.1-1-1.1-1.6.2-.6-1.4-1.4-.6.2-1.6-1.1-1 1.1-1-.2-1.6 1.4-.6.6-1.4 1.6.2 1-1.1z"
    stroke="url(#ashrun-neon-options)"
    stroke-width="2"
    stroke-linejoin="round"
  />

  <!-- center hub -->
  <circle
    cx="12"
    cy="12"
    r="2.4"
    stroke="url(#ashrun-neon-options)"
    stroke-width="2"
  />

  <!-- inner highlight -->
  <circle
    cx="12"
    cy="12"
    r="1.2"
    fill="#F4E9FF"
    opacity="0.7"
  />
  <path
    d="M12 6.8v1.2M17.2 12h-1.2M12 17.2v-1.2M6.8 12h1.2"
    stroke="#DDFBFF"
    stroke-width="0.5"
    stroke-linecap="round"
    opacity="0.6"
  />
</svg>
      `;
    case "progression":
      return `
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ashrun-neon-progression" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6EF3FF"/>
      <stop offset="38%" stop-color="#7A8CFF"/>
      <stop offset="70%" stop-color="#B56CFF"/>
      <stop offset="100%" stop-color="#FF6FD8"/>
    </linearGradient>
  </defs>

  <!-- soft glow -->
  <path
    d="M6 16v-4M10 16v-7M14 16v-10M6 8l4-3 4 2 4-3"
    stroke="url(#ashrun-neon-progression)"
    stroke-width="4"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.16"
  />

  <!-- bars -->
  <path
    d="M6 16v-4M10 16v-7M14 16v-10"
    stroke="url(#ashrun-neon-progression)"
    stroke-width="2.2"
    stroke-linecap="round"
  />

  <!-- upward trend line -->
  <path
    d="M6.5 8.5l3.5-2.5 3.5 1.8 3.5-2.5"
    stroke="url(#ashrun-neon-progression)"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- arrow tip -->
  <path
    d="M17 5.5l2 1.2-1.2 2"
    stroke="url(#ashrun-neon-progression)"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- inner highlights -->
  <path
    d="M6 13v-1M10 12v-1M14 11v-1"
    stroke="#DDFBFF"
    stroke-width="0.6"
    stroke-linecap="round"
    opacity="0.7"
  />
</svg>
      `;
    case "quit":
      return `
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ashrun-neon-quit" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6EF3FF"/>
      <stop offset="38%" stop-color="#7A8CFF"/>
      <stop offset="70%" stop-color="#B56CFF"/>
      <stop offset="100%" stop-color="#FF6FD8"/>
    </linearGradient>
  </defs>

  <!-- soft glow -->
  <path
    d="M12 4.5v6.5M7 7.5a7 7 0 1 0 10 0"
    stroke="url(#ashrun-neon-quit)"
    stroke-width="4"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.16"
  />

  <!-- main power shape -->
  <path
    d="M12 5v6M7.8 8.2a6 6 0 1 0 8.4 0"
    stroke="url(#ashrun-neon-quit)"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- inner highlight -->
  <path
    d="M12 6.2v3.8"
    stroke="#DDFBFF"
    stroke-width="0.6"
    stroke-linecap="round"
    opacity="0.7"
  />
  <path
    d="M9 9.5a4.5 4.5 0 1 0 6 0"
    stroke="#F4E9FF"
    stroke-width="0.6"
    stroke-linecap="round"
    opacity="0.5"
  />
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
  ariaLabel = label,
}) {
  const imageSlug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const imageUrl = `./assets/img/ui/buttons/${imageSlug}.png`;
  const imageMarkup = iconOnly
    ? ""
    : `
      <img
        class="title-button__image"
        src="${imageUrl}"
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        onload="this.closest('button')?.classList.add('title-button--image-loaded')"
        onerror="this.remove()"
      />
    `;

  return `
    <button
      class="menu-button ${className} ${iconOnly ? "" : "title-button--has-image"}"
      data-action="${action}"
      aria-label="${ariaLabel}"
      ${disabled ? "disabled" : ""}
    >
      ${imageMarkup}
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
  const menuEntries = [
    {
      action: "open-continue",
      className: "title-menu__button",
      label: "Continue",
      icon: "continue",
      disabled: !hasContinue,
    },
    {
      action: "open-new-run",
      className: "title-menu__button title-menu__button--primary",
      label: "New Run",
      icon: "new-run",
    },
    {
      action: "open-skirmish",
      className: "title-menu__button",
      label: "Skirmish",
      icon: "skirmish",
    },
    {
      action: "open-map-editor",
      className: "title-menu__button",
      label: "Map Editor",
      icon: "map-editor",
    },
    {
      action: "open-tutorial",
      className: "title-menu__button",
      label: "Tutorial",
      icon: "tutorial",
    },
    {
      action: "open-progression",
      className: "title-menu__button",
      label: "Progression",
      icon: "progression",
    },
    {
      action: "open-debug-run",
      className: "title-menu__button",
      label: "Sandbox",
      icon: "sandbox",
    },
  ];
  const menuMarkup = menuEntries
    .map(
      (entry) =>
        `<li class="title-menu__item">${renderTitleButton(entry)}</li>`,
    )
    .join("");

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
        <div class="title-scene__tank-rig">
          <div class="title-tank">
            <span class="title-tank__shadow"></span>
            <span class="title-tank__rear"></span>
            <span class="title-tank__hull"></span>
            <span class="title-tank__turret"></span>
            <span class="title-tank__cupola"></span>
            <span class="title-tank__barrel"></span>
            <span class="title-tank__track title-tank__track--left"></span>
            <span class="title-tank__track title-tank__track--right"></span>
          </div>
        </div>
      </div>
      <section class="title-card" aria-labelledby="title-screen-heading">
        ${renderTitleButton({
          action: "open-options",
          className: "ghost-button title-utility-button",
          label: "Options",
          icon: "options",
          iconOnly: true,
        })}
        <div class="title-layout">
          <div class="title-menu-panel">
            <div class="title-menu-panel__intro">
              <p class="eyebrow">Command Console</p>
              <p class="title-menu-panel__subtitle">Persistent squad tactics under neon skies.</p>
            </div>
            <nav class="title-menu" aria-label="Main menu">
              <ul class="title-menu__list">
                ${menuMarkup}
              </ul>
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
                icon: "quit",
              })}
            </div>
          </div>
          <div class="title-showcase">
            <img
              class="title-showcase__logo"
              id="title-screen-heading"
              src="./assets/img/logos/logo.png"
              alt="Ash Run '84"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
      </section>
    </div>
  `;
}
