const DEFAULT_UNIT_SPRITE_PRESENTATION = Object.freeze({
  battlefieldScale: 1,
  battlefieldMaxScale: 1,
  combatCutsceneScale: 1,
});

const UNIT_SPRITE_PRESENTATION_BY_TYPE = Object.freeze({
  grunt: Object.freeze({
    battlefieldScale: 0.9,
    battlefieldMaxScale: 0.9,
    combatCutsceneScale: 0.88,
  }),
  // bruiser: Object.freeze({
  //   battlefieldScale: 1.13,
  //   battlefieldMaxScale: 1.13,
  //   combatCutsceneScale: 1.14,
  // }),
});

function getPositiveScale(value, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getUnitSpritePresentation(unitTypeId) {
  return {
    ...DEFAULT_UNIT_SPRITE_PRESENTATION,
    ...(UNIT_SPRITE_PRESENTATION_BY_TYPE[unitTypeId] ?? {}),
  };
}

export function getClampedBattlefieldEffectMultiplier(
  presentation,
  requestedMultiplier = 1,
) {
  const resolvedRequestedMultiplier = getPositiveScale(requestedMultiplier);
  const battlefieldScale = getPositiveScale(presentation?.battlefieldScale);
  const battlefieldMaxScale = getPositiveScale(
    presentation?.battlefieldMaxScale,
  );

  // The default 1/1 pair means no custom ceiling, preserving existing effect pulses.
  if (battlefieldScale === 1 && battlefieldMaxScale === 1) {
    return resolvedRequestedMultiplier;
  }

  return Math.min(
    resolvedRequestedMultiplier,
    Math.max(1, battlefieldMaxScale / battlefieldScale),
  );
}
