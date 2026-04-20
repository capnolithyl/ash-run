export function renderTitleView(state) {
  const hasContinue = state.slots.some((slot) => slot.exists);

  return `
    <div class="screen screen--title">
      <section class="hero-card">
        <p class="eyebrow">Turn-Based Strategy Roguelite</p>
        <h1>Ash Run<span>Tactical Roguelite</span></h1>
        <p class="hero-copy">
          Lead a persistent strike force through a run of escalating tactical battles.
          Buy reinforcements on-map, keep your survivors alive, and push for a full clear.
        </p>
        <div class="menu-stack">
          <button class="menu-button" data-action="open-new-run">New Run</button>
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
        <p class="footer-note">
          Prototype goal: clear 10 maps in a row. Locked commanders remain in the enemy pool until unlocked.
        </p>
      </section>
    </div>
  `;
}
