export function formatRangeLabel(minimumRange, maximumRange) {
  return minimumRange === maximumRange
    ? `${maximumRange}`
    : `${minimumRange}-${maximumRange}`;
}

function getBattleHudStatIconUrl(fileName) {
  return `./assets/img/icons/battle-hud/stats/${encodeURIComponent(fileName)}`;
}

export function getBattleHudWeaponIconUrl(fileName) {
  return `./assets/img/icons/battle-hud/weapons/${encodeURIComponent(fileName)}`;
}

export function renderSelectionIcon(iconName) {
  switch (iconName) {
    case "attack":
      return `
        <img src="${getBattleHudStatIconUrl("atk.png")}" alt="" loading="lazy" decoding="async" />
      `;
    case "armor":
      return `
        <img src="${getBattleHudStatIconUrl("arm.png")}" alt="" loading="lazy" decoding="async" />
      `;
    case "movement":
      return `
        <img src="${getBattleHudStatIconUrl("mov.png")}" alt="" loading="lazy" decoding="async" />
      `;
    case "range":
      return `
        <img src="${getBattleHudStatIconUrl("rng.png")}" alt="" loading="lazy" decoding="async" />
      `;
    case "ammo":
      return `
        <img src="${getBattleHudStatIconUrl("ammo.png")}" alt="" loading="lazy" decoding="async" />
      `;
    case "stamina":
      return `
        <img src="${getBattleHudStatIconUrl("sta.png")}" alt="" loading="lazy" decoding="async" />
      `;
    case "command":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 18V9l6-4 6 4v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M9 18v-4h6v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M8 7.5h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "barracks":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 18V9l7-4 7 4v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M9 18v-4h6v4M8.5 11h1M12 11h1M15.5 11h1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "motor-pool":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 15V9h10l3 3v3H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <circle cx="8" cy="17" r="1.8" fill="none" stroke="currentColor" stroke-width="2"/>
          <circle cx="16" cy="17" r="1.8" fill="none" stroke="currentColor" stroke-width="2"/>
        </svg>
      `;
    case "airfield":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v16M8 10l4 2 4-2M9 18l3-2 3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    case "sector":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 20V5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M8 6h8l-2.2 3L16 12H8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      `;
    case "hospital":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "repair-station":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 6.5a3.5 3.5 0 01-4.8 4.8l-4.9 4.9 2 2 4.9-4.9a3.5 3.5 0 004.8-4.8l-2.2 2.2-2.8-2.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      `;
    case "plain":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 18c1.5-3 3.2-4.7 6-6.2M12 18c1-2.1 2.3-3.8 4.8-5.3M8.5 10.5L10 7M14.5 11L16 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "road":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 20l2-16M15 20l-2-16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M12 7v2M12 12v2M12 17v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "forest":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5l4 5h-2l3 4h-3l2 4H8l2-4H7l3-4H8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      `;
    case "mountain":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 18l5-8 3 4 3-6 5 10H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      `;
    case "water":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 10c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2M4 15c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    case "ridge":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 18l4-5 3 3 3-6 6 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M6 9l2-3 2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      `;
    default:
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
        </svg>
      `;
  }
}
