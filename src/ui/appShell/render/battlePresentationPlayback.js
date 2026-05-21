import { BATTLE_POST_COMBAT_PAUSE_MS, SCREEN_IDS } from "../../../game/core/constants.js";
import { deriveBattleAnimationEvents } from "../../../game/phaser/view/battleAnimationEvents.js";

const LEVEL_UP_REVEAL_HOLD_MS = 760;
const LEVEL_UP_POPUP_INTRO_MS = 180;
const LEVEL_UP_CHANGED_STAT_MS = 260;
const LEVEL_UP_UNCHANGED_STAT_MS = 120;
const LEVEL_UP_STAT_GAP_MS = 110;
const LEVEL_UP_POPUP_FINAL_HOLD_MS = 220;

function getPlaybackNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function easeOutSine(progress) {
  return Math.sin((Math.max(0, Math.min(1, progress)) * Math.PI) / 2);
}

function buildExperienceAnimationKey(snapshot, event) {
  return [
    snapshot?.id ?? "snapshot",
    event.unitId,
    event.previousLevel,
    event.nextLevel,
    event.previousExperience,
    event.nextExperience
  ].join(":");
}

function buildLevelUpKey(levelUpEvent) {
  return `${levelUpEvent.unitId}-${levelUpEvent.previousLevel}-${levelUpEvent.newLevel}`;
}

function getLevelUpStatSheet(levelUpEvent) {
  return levelUpEvent?.statSheet ?? [];
}

function getLevelUpRowDuration(row) {
  return row.changed ? LEVEL_UP_CHANGED_STAT_MS : LEVEL_UP_UNCHANGED_STAT_MS;
}

function computeExperiencePresentation(animation, timestamp) {
  const delayOffsetMs = animation.delayOffsetMs ?? 0;
  const event = animation.event;
  const segmentTimings = event.segmentTimings ?? [];
  const initialPresentation = {
    level: event.previousLevel,
    experience: event.previousExperience,
    experienceToNextLevel: event.previousThreshold,
    ratio: event.previousThreshold > 0 ? event.previousExperience / event.previousThreshold : 0,
    complete: false
  };

  if (segmentTimings.length === 0) {
    return {
      level: event.nextLevel,
      experience: event.nextExperience,
      experienceToNextLevel: event.nextThreshold,
      ratio: event.nextThreshold > 0 ? event.nextExperience / event.nextThreshold : 0,
      complete: true
    };
  }

  for (let index = 0; index < segmentTimings.length; index += 1) {
    const segment = segmentTimings[index];
    const nextSegment = segmentTimings[index + 1] ?? null;
    const segmentStartAt = animation.startedAt + segment.startDelayMs + delayOffsetMs;
    const segmentEndAt = animation.startedAt + segment.endDelayMs + delayOffsetMs;

    if (timestamp < segmentStartAt) {
      return index === 0
        ? initialPresentation
        : {
            level: segmentTimings[index - 1].level,
            experience: segmentTimings[index - 1].toExperience,
            experienceToNextLevel: segmentTimings[index - 1].threshold,
            ratio:
              segmentTimings[index - 1].threshold > 0
                ? segmentTimings[index - 1].toExperience / segmentTimings[index - 1].threshold
                : 0,
            complete: false
          };
    }

    if (timestamp <= segmentEndAt) {
      const progress = easeOutSine((timestamp - segmentStartAt) / Math.max(1, segment.durationMs));
      const experience =
        segment.fromExperience + (segment.toExperience - segment.fromExperience) * progress;

      return {
        level: segment.level,
        experience,
        experienceToNextLevel: segment.threshold,
        ratio: segment.threshold > 0 ? experience / segment.threshold : 0,
        complete: false
      };
    }

    if (nextSegment) {
      const nextSegmentStartAt = animation.startedAt + nextSegment.startDelayMs + delayOffsetMs;

      if (timestamp < nextSegmentStartAt) {
        return {
          level: segment.level,
          experience: segment.toExperience,
          experienceToNextLevel: segment.threshold,
          ratio: segment.threshold > 0 ? segment.toExperience / segment.threshold : 0,
          complete: false
        };
      }
    }
  }

  return {
    level: event.nextLevel,
    experience: event.nextExperience,
    experienceToNextLevel: event.nextThreshold,
    ratio: event.nextThreshold > 0 ? event.nextExperience / event.nextThreshold : 0,
    complete: timestamp >= animation.completedAt
  };
}

function computeLevelUpPresentation(levelUpEvent, playback, timestamp) {
  const statSheet = getLevelUpStatSheet(levelUpEvent);

  if (!playback || playback.reducedMotion) {
    return {
      continueEnabled: true,
      complete: true,
      rows: statSheet.map((row) => ({
        ...row,
        displayValue: row.afterValue,
        phase: row.changed ? "settled" : "static"
      }))
    };
  }

  let cursor = playback.startedAt + LEVEL_UP_POPUP_INTRO_MS;
  const rows = statSheet.map((row) => {
    const durationMs = getLevelUpRowDuration(row);
    const rowStartAt = cursor;
    const rowEndAt = rowStartAt + durationMs;
    cursor = rowEndAt + LEVEL_UP_STAT_GAP_MS;

    if (timestamp < rowStartAt) {
      return {
        ...row,
        displayValue: row.beforeValue,
        phase: row.changed ? "pending" : "static"
      };
    }

    if (timestamp <= rowEndAt) {
      if (!row.changed) {
        return {
          ...row,
          displayValue: row.afterValue,
          phase: "active-static"
        };
      }

      const progress = easeOutSine((timestamp - rowStartAt) / Math.max(1, durationMs));
      return {
        ...row,
        displayValue: Math.round(row.beforeValue + row.delta * progress),
        phase: "active"
      };
    }

    return {
      ...row,
      displayValue: row.afterValue,
      phase: row.changed ? "settled" : "static"
    };
  });

  const continueAt = cursor + LEVEL_UP_POPUP_FINAL_HOLD_MS;

  return {
    continueEnabled: timestamp >= continueAt,
    complete: timestamp >= continueAt,
    rows
  };
}

function updateExperienceCard(card, presentation) {
  if (!card || !presentation) {
    return;
  }

  const levelBadge = card.querySelector("[data-experience-level]");
  const valueLabel = card.querySelector("[data-experience-value]");
  const xpFill = card.querySelector('[data-meter-fill="xp"]');
  const roundedExperience = Math.round(presentation.experience);
  const ratioPercent = Math.max(6, Math.max(0, Math.min(1, presentation.ratio)) * 100);

  if (levelBadge) {
    levelBadge.textContent = `${presentation.level}`;
    levelBadge.setAttribute("aria-label", `Level ${presentation.level}`);
  }

  if (valueLabel) {
    valueLabel.textContent = `${roundedExperience}/${presentation.experienceToNextLevel}`;
  }

  if (xpFill) {
    xpFill.dataset.meterValue = `${ratioPercent}`;
    xpFill.dataset.experienceThreshold = `${presentation.experienceToNextLevel}`;
    xpFill.style.width = `${ratioPercent}%`;
  }
}

function updateLevelUpOverlay(overlay, presentation) {
  if (!overlay || !presentation) {
    return;
  }

  overlay
    .querySelector(".overlay-card--level-up")
    ?.classList.toggle("overlay-card--level-up-ready", presentation.continueEnabled);
  overlay
    .querySelector(".level-up-card__footer")
    ?.classList.toggle("level-up-card__footer--visible", presentation.continueEnabled);

  const continueButton = overlay.querySelector('[data-action="acknowledge-level-up"]');

  if (continueButton) {
    continueButton.disabled = !presentation.continueEnabled;
  }

  for (const row of presentation.rows ?? []) {
    const rowElement = overlay.querySelector(`[data-level-up-stat="${row.stat}"]`);
    const displayValue = overlay.querySelector(`[data-level-up-display="${row.stat}"]`);

    if (!rowElement || !displayValue) {
      continue;
    }

    const showNewValue = row.changed && row.phase !== "pending";

    rowElement.className = `level-up-stat level-up-stat--${row.phase}${row.changed ? " level-up-stat--changed" : ""}`;
    displayValue.className = `level-up-stat__next${showNewValue ? "" : " level-up-stat__next--empty"}`;
    displayValue.textContent = showNewValue ? `${row.displayValue}` : "--";

    if (showNewValue) {
      displayValue.removeAttribute("aria-hidden");
    } else {
      displayValue.setAttribute("aria-hidden", "true");
    }
  }
}

export const appShellBattlePresentationPlaybackMethods = {
  ensureBattlePresentationPlaybackState() {
    this.battleExperienceAnimations ??= new Map();
    this.levelUpRevealByKey ??= new Map();
    this.activeLevelUpPlayback ??= null;
    this.battlePresentationAnimationFrame ??= null;
  },

  clearBattlePresentationPlayback() {
    this.ensureBattlePresentationPlaybackState();

    if (this.battlePresentationAnimationFrame) {
      window.cancelAnimationFrame(this.battlePresentationAnimationFrame);
      this.battlePresentationAnimationFrame = null;
    }

    this.battleExperienceAnimations.clear();
    this.levelUpRevealByKey.clear();
    this.activeLevelUpPlayback = null;
  },

  prepareBattlePresentationPlayback(state) {
    this.ensureBattlePresentationPlaybackState();

    if (state.screen !== SCREEN_IDS.BATTLE || !state.battleSnapshot) {
      this.clearBattlePresentationPlayback();
      return;
    }

    const currentQueueKeys = new Set(
      (state.battleSnapshot.levelUpQueue ?? []).map((levelUpEvent) => buildLevelUpKey(levelUpEvent))
    );

    for (const key of [...this.levelUpRevealByKey.keys()]) {
      if (!currentQueueKeys.has(key)) {
        this.levelUpRevealByKey.delete(key);
      }
    }

    if (
      !this.previousBattleSnapshot ||
      this.previousBattleSnapshot.id !== state.battleSnapshot.id ||
      this.previousBattleSnapshot.map.id !== state.battleSnapshot.map.id
    ) {
      const now = Date.now();

      currentQueueKeys.forEach((key) => {
        if (!this.levelUpRevealByKey.has(key)) {
          this.levelUpRevealByKey.set(key, now);
        }
      });

      return;
    }

    const reducedMotion = prefersReducedMotion();
    const now = getPlaybackNow();
    const revealNow = Date.now();
    const combatCutsceneDuration = state.battleUi?.combatCutscene?.durationMs ?? 0;
    const postCombatPauseMs = combatCutsceneDuration > 0 ? BATTLE_POST_COMBAT_PAUSE_MS : 0;
    const experienceEvents = deriveBattleAnimationEvents(
      this.previousBattleSnapshot,
      state.battleSnapshot
    ).filter((event) => event.type === "experience");

    for (const event of experienceEvents) {
      const signature = buildExperienceAnimationKey(state.battleSnapshot, event);
      const effectiveStartDelayMs = Math.max(
        event.startDelayMs ?? 0,
        combatCutsceneDuration + postCombatPauseMs
      );
      const delayOffsetMs = effectiveStartDelayMs - (event.startDelayMs ?? 0);
      const effectiveEndDelayMs = (event.endDelayMs ?? 0) + delayOffsetMs;

      if (!reducedMotion && !this.battleExperienceAnimations.has(signature)) {
        this.battleExperienceAnimations.set(signature, {
          signature,
          snapshotId: state.battleSnapshot.id,
          unitId: event.unitId,
          event,
          startedAt: now,
          delayOffsetMs,
          completedAt: now + effectiveEndDelayMs
        });
      }

      const revealAt =
        revealNow +
        (reducedMotion ? 0 : effectiveEndDelayMs + LEVEL_UP_REVEAL_HOLD_MS);

      for (const levelUpEvent of state.battleSnapshot.levelUpQueue ?? []) {
        if (
          levelUpEvent.unitId === event.unitId &&
          levelUpEvent.previousLevel >= event.previousLevel &&
          levelUpEvent.newLevel <= event.nextLevel
        ) {
          this.levelUpRevealByKey.set(buildLevelUpKey(levelUpEvent), revealAt);
        }
      }
    }

    currentQueueKeys.forEach((key) => {
      if (!this.levelUpRevealByKey.has(key)) {
        this.levelUpRevealByKey.set(key, revealNow);
      }
    });
  },

  getBattleExperiencePresentation() {
    this.ensureBattlePresentationPlaybackState();

    const presentationByUnitId = {};
    const now = getPlaybackNow();

    for (const [signature, animation] of this.battleExperienceAnimations.entries()) {
      const presentation = computeExperiencePresentation(animation, now);

      presentationByUnitId[animation.unitId] = presentation;

      if (presentation.complete) {
        this.battleExperienceAnimations.delete(signature);
      }
    }

    return presentationByUnitId;
  },

  getLevelUpRevealAt(levelUpKey) {
    this.ensureBattlePresentationPlaybackState();
    return this.levelUpRevealByKey.get(levelUpKey) ?? 0;
  },

  getLevelUpPresentation(state, { suppressLevelUpOverlay = false } = {}) {
    this.ensureBattlePresentationPlaybackState();

    const levelUpEvent = state.battleSnapshot?.levelUpQueue?.[0] ?? null;

    if (!levelUpEvent || suppressLevelUpOverlay) {
      return null;
    }

    const key = buildLevelUpKey(levelUpEvent);
    const reducedMotion = prefersReducedMotion();

    if (reducedMotion) {
      this.activeLevelUpPlayback = {
        key,
        startedAt: getPlaybackNow(),
        reducedMotion: true
      };
    } else if (this.activeLevelUpPlayback?.key !== key) {
      this.activeLevelUpPlayback = {
        key,
        startedAt: getPlaybackNow(),
        reducedMotion: false
      };
    }

    return computeLevelUpPresentation(levelUpEvent, this.activeLevelUpPlayback, getPlaybackNow());
  },

  syncBattlePresentationPlayback(state, { suppressLevelUpOverlay = false } = {}) {
    this.ensureBattlePresentationPlaybackState();

    if (state.screen !== SCREEN_IDS.BATTLE) {
      this.clearBattlePresentationPlayback();
      return;
    }

    const now = getPlaybackNow();
    const experiencePresentation = this.getBattleExperiencePresentation();

    for (const card of this.root.querySelectorAll("[data-selection-unit-card]")) {
      const unitId = card.dataset.selectionUnitCard;

      if (!unitId || !experiencePresentation[unitId]) {
        continue;
      }

      updateExperienceCard(card, experiencePresentation[unitId]);
    }

    if (!suppressLevelUpOverlay) {
      const levelUpEvent = state.battleSnapshot?.levelUpQueue?.[0] ?? null;
      const overlay = this.root.querySelector("[data-level-up-key]");

      if (levelUpEvent && overlay) {
        updateLevelUpOverlay(
          overlay,
          computeLevelUpPresentation(levelUpEvent, this.activeLevelUpPlayback, now)
        );
      }
    }

    const activeExperience = [...this.battleExperienceAnimations.values()].some(
      (animation) => now < animation.completedAt
    );
    const activeLevelUp =
      !suppressLevelUpOverlay &&
      this.activeLevelUpPlayback?.key ===
        buildLevelUpKey(state.battleSnapshot?.levelUpQueue?.[0] ?? {}) &&
      !computeLevelUpPresentation(
        state.battleSnapshot?.levelUpQueue?.[0] ?? null,
        this.activeLevelUpPlayback,
        now
      ).complete;

    if (!activeExperience && !activeLevelUp) {
      if (this.battlePresentationAnimationFrame) {
        window.cancelAnimationFrame(this.battlePresentationAnimationFrame);
        this.battlePresentationAnimationFrame = null;
      }
      return;
    }

    if (!this.battlePresentationAnimationFrame) {
      this.battlePresentationAnimationFrame = window.requestAnimationFrame((timestamp) => {
        this.battlePresentationAnimationFrame = null;
        const currentKey = this.getLevelUpKey(this.latestState?.battleSnapshot);
        const suppressLevelUpOverlay = currentKey
          ? Date.now() < this.getLevelUpRevealAt(currentKey)
          : false;
        this.syncBattlePresentationPlayback(this.latestState, {
          suppressLevelUpOverlay
        });
      });
    }
  }
};
