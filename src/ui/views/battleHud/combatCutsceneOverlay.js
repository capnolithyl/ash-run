import { TURN_SIDES } from "../../../game/core/constants.js";
import { getUnitSpriteDefinition } from "../../../game/phaser/assets.js";
import { getBattleCombatCutsceneState } from "../../../game/phaser/view/battleCombatCutscene.js";
import {
  getAnimationRange,
  getAnimationRangeFrameCount,
  getAttackAnimationPlayback
} from "../../../game/phaser/view/unitAnimationHelpers.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatWeaponLabel(weaponClass) {
  if (!weaponClass) {
    return "Combat Exchange";
  }

  return weaponClass
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getIdleAnimationConfig(unit, side) {
  const spriteDefinition = getUnitSpriteDefinition(unit.unitTypeId, side);
  const idleAnimation = spriteDefinition?.idle ?? null;
  const idleRange = getAnimationRange(idleAnimation, "default");
  const idleFrameCount = getAnimationRangeFrameCount(idleRange);

  if (idleAnimation && idleRange && idleFrameCount > 0) {
    return {
      mode: "sheet",
      url: idleAnimation.url,
      frameWidth: spriteDefinition?.frameWidth ?? null,
      frameHeight: spriteDefinition?.frameHeight ?? null,
      frameCount: idleFrameCount,
      frameStart: idleRange.start,
      durationMs: Math.max(
        320,
        Math.round((idleFrameCount / Math.max(1, idleAnimation.frameRate ?? 1)) * 1000)
      ),
      iterations: "infinite"
    };
  }

  if (spriteDefinition?.fallbackUrl) {
    return {
      mode: "image",
      url: spriteDefinition.fallbackUrl
    };
  }

  return {
    mode: "text",
    label: unit.name.slice(0, 2).toUpperCase()
  };
}

function getAttackSheetConfig(unit, side, cutscene) {
  const spriteDefinition = getUnitSpriteDefinition(unit.unitTypeId, side);
  const attackAnimation = spriteDefinition?.attack ?? null;
  const attackPlayback = getAttackAnimationPlayback(side, attackAnimation, 0);
  const attackRange = attackPlayback?.range ?? null;
  const attackFrameCount = getAnimationRangeFrameCount(attackRange);
  const step = cutscene.steps.find((candidate) => candidate.attackerSide === side) ?? null;
  const windowMs = step?.windowMs ?? 960;
  const loopCount = Math.max(1, step?.loopCount ?? 1);

  if (attackAnimation && attackRange && attackFrameCount > 0 && attackPlayback) {
    return {
      mode: "sheet",
      url: attackAnimation.url,
      frameWidth: spriteDefinition?.frameWidth ?? null,
      frameHeight: spriteDefinition?.frameHeight ?? null,
      frameCount: attackFrameCount,
      frameStart: attackRange.start,
      durationMs: Math.max(120, Math.round(windowMs / loopCount)),
      iterations: loopCount,
      flipX: attackPlayback.flipX === true
    };
  }

  return null;
}

function getIdleLayerConfig(unit, side, cutscene) {
  const attackSheetConfig = getAttackSheetConfig(unit, side, cutscene);

  if (attackSheetConfig) {
    return {
      ...attackSheetConfig,
      staticFrame: true,
      iterations: 1
    };
  }

  return getIdleAnimationConfig(unit, side);
}

function getAttackLayerConfig(unit, side, cutscene) {
  const attackSheetConfig = getAttackSheetConfig(unit, side, cutscene);

  if (attackSheetConfig) {
    return attackSheetConfig;
  }

  return getIdleAnimationConfig(unit, side);
}

function renderSpriteLayer(layerConfig, side, layerType) {
  const layerClasses = [
    "combat-cutscene__sprite-layer",
    `combat-cutscene__sprite-layer--${layerType}`
  ]
    .filter(Boolean)
    .join(" ");

  if (layerConfig.mode === "sheet") {
    return `
      <div class="${layerClasses}">
        <div
          class="combat-cutscene__sprite-sheet-viewport"
          style="--frame-width:${layerConfig.frameWidth ?? 1}; --frame-height:${layerConfig.frameHeight ?? 1};"
        >
          <div
            class="combat-cutscene__sprite-sheet-surface"
            style="--sheet-flip-x:${layerConfig.flipX ? -1 : 1};"
            aria-hidden="true"
          >
            <img
              class="combat-cutscene__sprite-sheet-image"
              src="${layerConfig.url}"
              alt=""
              loading="eager"
              decoding="async"
              data-cutscene-sheet="${side}:${layerType}"
              ${layerType === "attack" ? `data-cutscene-attack-strip="${side}"` : ""}
              data-cutscene-side="${side}"
              data-cutscene-layer="${layerType}"
              data-frame-width="${layerConfig.frameWidth ?? ""}"
              data-frame-height="${layerConfig.frameHeight ?? ""}"
              data-frame-count="${layerConfig.frameCount}"
              data-frame-start="${layerConfig.frameStart}"
              data-loop-count="${layerConfig.iterations ?? 1}"
              data-sheet-duration-ms="${layerConfig.durationMs ?? 0}"
            />
          </div>
        </div>
      </div>
    `;
  }

  if (layerConfig.mode === "image") {
    return `
      <div class="${layerClasses}">
        <img
          class="combat-cutscene__sprite-image"
          src="${layerConfig.url}"
          alt=""
          loading="eager"
          decoding="async"
        />
      </div>
    `;
  }

  return `
    <div class="${layerClasses} combat-cutscene__sprite-layer--text">
      <div class="combat-cutscene__sprite-fallback">${layerConfig.label}</div>
    </div>
  `;
}

function renderUnitSprite(unit, side, cutscene, activeStep, impactStep) {
  const idleConfig = getIdleLayerConfig(unit, side, cutscene);
  const attackConfig = getAttackLayerConfig(unit, side, cutscene);
  const actorClasses = [
    "combat-cutscene__sprite-actor",
    activeStep?.attackerSide === side ? "combat-cutscene__sprite-actor--attacking" : "",
    impactStep?.targetSide === side ? "combat-cutscene__sprite-actor--hit" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="${actorClasses}" data-cutscene-sprite="${side}" role="img" aria-label="${unit.name} combat portrait">
      ${renderSpriteLayer(idleConfig, side, "idle")}
      ${renderSpriteLayer(attackConfig, side, "attack")}
    </div>
  `;
}

function renderHealthColumn(side, unit, currentHp, impactStep) {
  const currentRatio = clamp(currentHp / Math.max(1, unit.maxHealth), 0, 1);
  const previousRatio =
    impactStep?.targetSide === side
      ? clamp(impactStep.targetHpBefore / Math.max(1, unit.maxHealth), 0, 1)
      : currentRatio;
  const animateImpact = impactStep?.targetSide === side;

  return `
    <div class="combat-cutscene__health combat-cutscene__health--${side}">
      <div class="combat-cutscene__health-header">
        <span>HP</span>
        <strong data-cutscene-hp-value="${side}">${Math.round(currentHp)}</strong>
      </div>
      <div class="combat-cutscene__health-rail" aria-hidden="true">
        <span
          class="combat-cutscene__health-fill ${animateImpact ? "combat-cutscene__health-fill--animate" : ""}"
          data-cutscene-hp-fill="${side}"
          style="--hp-from-ratio:${previousRatio.toFixed(4)}; --hp-ratio:${currentRatio.toFixed(4)};"
        ></span>
      </div>
      <small>/${unit.maxHealth}</small>
    </div>
  `;
}

function renderCombatLane(side, unit, terrainId, currentHp, cutscene, activeStep, impactStep) {
  const laneClasses = [
    "combat-cutscene__lane",
    `combat-cutscene__lane--${side}`,
    activeStep?.attackerSide === side ? "combat-cutscene__lane--attacking" : "",
    impactStep?.targetSide === side ? "combat-cutscene__lane--impact" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <section
      class="${laneClasses}"
      data-cutscene-lane="${side}"
      data-terrain-id="${terrainId ?? "unknown"}"
      aria-label="${side === TURN_SIDES.PLAYER ? "Player combat view" : "Enemy combat view"}"
    >
      ${renderHealthColumn(side, unit, currentHp, impactStep)}
      <div class="combat-cutscene__stage">
        <div class="combat-cutscene__grid" aria-hidden="true"></div>
        <div class="combat-cutscene__platform" aria-hidden="true"></div>
        <div class="combat-cutscene__sprite-wrap">
          ${renderUnitSprite(unit, side, cutscene, activeStep, impactStep)}
        </div>
      </div>
    </section>
  `;
}

export function renderCombatCutsceneOverlay(cutscene, options = {}) {
  if (!cutscene) {
    return "";
  }

  const timeline = getBattleCombatCutsceneState(cutscene);
  const activeWeaponClass = timeline.activeStep
    ? timeline.activeStep.attackerSide === TURN_SIDES.ENEMY
      ? cutscene.enemyUnit.weaponClass
      : cutscene.playerUnit.weaponClass
    : (cutscene.steps.at(-1)?.attackerSide ?? TURN_SIDES.PLAYER) === TURN_SIDES.ENEMY
      ? cutscene.enemyUnit.weaponClass
      : cutscene.playerUnit.weaponClass;
  const currentWeaponLabel = formatWeaponLabel(activeWeaponClass);
  const screenShakeEnabled = options.screenShake !== false;
  const overlayClasses = [
    "battle-overlay",
    "battle-overlay--combat-cutscene",
    timeline.isWaitingForReveal ? "battle-overlay--combat-cutscene-hidden" : "",
    timeline.isOpening ? "battle-overlay--combat-cutscene-opening" : "",
    timeline.isClosing ? "battle-overlay--combat-cutscene-outro" : "",
    timeline.impactStep && screenShakeEnabled ? "battle-overlay--combat-cutscene-shake" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="${overlayClasses}" data-combat-cutscene-id="${cutscene.id}">
      <div class="combat-cutscene">
        <header class="combat-cutscene__header">
          <div class="combat-cutscene__unit-summary combat-cutscene__unit-summary--player">
            <span class="combat-cutscene__unit-badge" aria-hidden="true"></span>
            <strong>${cutscene.playerUnit.name}</strong>
          </div>
          <div class="combat-cutscene__header-pill">HP</div>
          <div class="combat-cutscene__unit-summary combat-cutscene__unit-summary--enemy">
            <strong>${cutscene.enemyUnit.name}</strong>
            <span class="combat-cutscene__unit-badge" aria-hidden="true"></span>
          </div>
        </header>
        <div class="combat-cutscene__body" data-cutscene-body>
          ${renderCombatLane(
            TURN_SIDES.PLAYER,
            cutscene.playerUnit,
            cutscene.playerTerrainId,
            timeline.displayedHpBySide[TURN_SIDES.PLAYER],
            cutscene,
            timeline.activeStep,
            timeline.impactStep
          )}
          <div class="combat-cutscene__divider" aria-hidden="true"></div>
          ${renderCombatLane(
            TURN_SIDES.ENEMY,
            cutscene.enemyUnit,
            cutscene.enemyTerrainId,
            timeline.displayedHpBySide[TURN_SIDES.ENEMY],
            cutscene,
            timeline.activeStep,
            timeline.impactStep
          )}
        </div>
        <footer class="combat-cutscene__footer">
          <span data-cutscene-weapon-label>${currentWeaponLabel}</span>
        </footer>
      </div>
    </div>
  `;
}
