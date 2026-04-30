const TUTORIAL_STEPS = [
  {
    id: "run",
    eyebrow: "01 / Run Plan",
    title: "Clear ten maps, keep veterans alive.",
    summary:
      "Ash Run '84 mixes map-local tactics with a persistent squad. Win each battle, carry survivors forward, and unlock commanders after full clears.",
    points: [
      "Your goal is a 10-map run.",
      "Surviving units keep XP, levels, and stat growth.",
      "Defeat ends the run, so preserving strong units matters."
    ],
    drill: "Before deploying, pick a commander whose passive fits the squad you want to protect."
  },
  {
    id: "turn",
    eyebrow: "02 / Your Turn",
    title: "Select, move, act, then end turn.",
    summary:
      "Most turns are a rhythm of inspecting tiles, moving units, attacking or using a command, and passing control to the enemy.",
    points: [
      "Select a unit to preview movement and legal actions.",
      "Use Fire, Capture, Support, Enter, Unload, Wait, or Redo from the command prompt.",
      "Next Unit jumps to another ready unit; End Turn hands the field to the enemy."
    ],
    drill: "Tap empty tiles to inspect terrain. Tap a unit again after moving to open its command prompt."
  },
  {
    id: "combat",
    eyebrow: "03 / Combat",
    title: "Ranges, armor, ammo, and matchups decide trades.",
    summary:
      "Damage follows a clean order: attack, HP scaling, luck, then defense. Low-HP attackers and wounded counterattacks naturally hit softer.",
    points: [
      "Effective attacks add a flat +6 attack before HP scaling instead of using hidden multipliers.",
      "Primary weapons hit harder; empty-ammo units fall back to weaker secondary fire.",
      "Defenders counter only when the attacker is in their legal range.",
      "Infantry, vehicles, and air units each have counters, so inspect before committing."
    ],
    drill: "Look for highlighted attack tiles and enemy preview stats before spending a unit's action."
  },
  {
    id: "economy",
    eyebrow: "04 / Economy",
    title: "Capture intel, deny income, hold service points.",
    summary:
      "In run mode, your squad is bought before the map. Capturing buildings now pays Intel Credits, cuts enemy income lanes, and keeps your service sites online.",
    points: [
      "The first time you capture a building in a battle, the infantry that took it earns Intel Credits and capture XP.",
      "Enemy-owned production buildings still matter because the enemy uses them to buy reinforcements.",
      "Sectors service units each turn; command posts resupply without healing; hospitals restore infantry on capture; repair stations restore vehicles."
    ],
    drill: "Use combat infantry to capture. Medics and mechanics are support units, not capture units."
  },
  {
    id: "commanders",
    eyebrow: "05 / Commanders",
    title: "Passives are constant; powers are timing windows.",
    summary:
      "Every commander has an always-on passive and a charged active power. Charge comes from dealing and taking damage, then resets after use.",
    points: [
      "Atlas, Viper, and Rook start unlocked.",
      "Active powers can heal, resupply, strike, shield, boost movement, boost attack, or manipulate battlefield resources.",
      "Commander charge resets between maps, so use powers to solve the current field."
    ],
    drill: "Use Commander Power only when the meter is full and the effect will change the current map."
  },
  {
    id: "advanced",
    eyebrow: "06 / Advanced",
    title: "Win by combining tempo, logistics, and preservation.",
    summary:
      "The stronger play is rarely just attacking. Transport, support, terrain, and capture tempo let a small squad survive bad maps.",
    points: [
      "Runners can carry one infantry unit and unload it onto a legal adjacent tile.",
      "Medics support adjacent infantry; mechanics support adjacent vehicles and then go on cooldown.",
      "Enemy recruitment is capped, but the enemy still captures, repairs, stages, and hunts favorable trades."
    ],
    drill: "Protect high-level survivors, use new recruits as tactical answers, and avoid feeding the enemy clean counters."
  }
];

function renderStepNav(step, index) {
  return `
    <label class="tutorial-step-button" for="tutorial-step-${step.id}">
      <span>${String(index + 1).padStart(2, "0")}</span>
      ${step.title}
    </label>
  `;
}

function renderStepPanel(step, index) {
  const previousStep = TUTORIAL_STEPS[index - 1] ?? TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1];
  const nextStep = TUTORIAL_STEPS[index + 1] ?? TUTORIAL_STEPS[0];

  return `
    <article class="tutorial-step-panel tutorial-step-panel--${step.id}">
      <p class="eyebrow">${step.eyebrow}</p>
      <h3>${step.title}</h3>
      <p class="tutorial-step-panel__summary">${step.summary}</p>
      <div class="tutorial-scanline" aria-hidden="true"></div>
      <ul class="tutorial-point-list">
        ${step.points.map((point) => `<li>${point}</li>`).join("")}
      </ul>
      <div class="tutorial-drill">
        <span>Field Drill</span>
        <p>${step.drill}</p>
      </div>
      <div class="tutorial-panel-actions">
        <label class="ghost-button ghost-button--small" for="tutorial-step-${previousStep.id}">Back</label>
        <label class="menu-button menu-button--small" for="tutorial-step-${nextStep.id}">Next</label>
      </div>
    </article>
  `;
}

export function renderTutorialView() {
  return `
    <div class="screen screen--tutorial">
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
      <section class="panel panel--static tutorial-panel">
        <div class="panel-header tutorial-header">
          <div>
            <p class="eyebrow">Training Sim</p>
            <h2>Field Manual</h2>
            <p>Short drills for the basics, the run layer, and the tools that keep veteran units alive.</p>
          </div>
          <button class="ghost-button" data-action="back-to-title">Back</button>
        </div>

        <div class="tutorial-shell">
          ${TUTORIAL_STEPS.map(
            (step, index) => `
              <input
                class="tutorial-step-toggle"
                id="tutorial-step-${step.id}"
                name="tutorial-step"
                type="radio"
                ${index === 0 ? "checked" : ""}
              />
            `
          ).join("")}
          <nav class="tutorial-step-nav" aria-label="Tutorial sections">
            ${TUTORIAL_STEPS.map(renderStepNav).join("")}
          </nav>
          <div class="tutorial-step-stage">
            ${TUTORIAL_STEPS.map(renderStepPanel).join("")}
          </div>
        </div>

        <div class="tutorial-checklist" aria-label="Readiness checklist">
          <label><input type="checkbox" /> I can win by eliminating the enemy force.</label>
          <label><input type="checkbox" /> I know commander charge resets each map and Intel Credits come from captures and map clears.</label>
          <label><input type="checkbox" /> I know survivors persist, but defeated units are gone from the run.</label>
        </div>

        <div class="panel-footer tutorial-footer">
          <span>Ready when you can explain why moving first is sometimes better than attacking first.</span>
          <button class="menu-button" data-action="open-new-run">Start A Run</button>
        </div>
      </section>
    </div>
  `;
}
