import { BATTLE_FUNDS_GAIN_ANIMATION_MS } from "../../../game/core/constants.js";
import { BATTLE_HP_METER_ANIMATION_MS } from "../shared.js";

export const appShellBattleMeterMethods = {
  animateFundsGain(state) {
    const fundsGain = state.battleUi?.fundsGain;

    if (!fundsGain || fundsGain.pending) {
      if (this.fundsAnimationFrame) {
        window.cancelAnimationFrame(this.fundsAnimationFrame);
        this.fundsAnimationFrame = null;
      }

      this.activeFundsGainId = null;
      this.activeFundsGainElement = null;
      return;
    }

    const valueElement = this.root.querySelector(`[data-funds-value="${fundsGain.side}"]`);

    if (!valueElement) {
      return;
    }

    if (this.activeFundsGainId === fundsGain.id && this.activeFundsGainElement === valueElement) {
      return;
    }

    if (this.fundsAnimationFrame) {
      window.cancelAnimationFrame(this.fundsAnimationFrame);
      this.fundsAnimationFrame = null;
    }

    this.activeFundsGainId = fundsGain.id;
    this.activeFundsGainElement = valueElement;

    const from = Number(fundsGain.from);
    const to = Number(fundsGain.to);
    const duration = Number(fundsGain.durationMs) || BATTLE_FUNDS_GAIN_ANIMATION_MS;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      valueElement.textContent = `${to}`;
      return;
    }

    const startedAt = performance.now();
    valueElement.textContent = `${from}`;

    const tick = (timestamp) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const easedProgress = 1 - (1 - progress) ** 3;
      const currentValue = Math.round(from + (to - from) * easedProgress);

      valueElement.textContent = `${currentValue}`;

      if (progress < 1 && this.activeFundsGainId === fundsGain.id) {
        this.fundsAnimationFrame = window.requestAnimationFrame(tick);
        return;
      }

      valueElement.textContent = `${to}`;
      this.fundsAnimationFrame = null;
    };

    this.fundsAnimationFrame = window.requestAnimationFrame(tick);
  },

  captureBattleMeterState() {
    const meterState = new Map();

    for (const card of this.root.querySelectorAll("[data-selection-unit-card]")) {
      const unitId = card.dataset.selectionUnitCard;

      if (!unitId) {
        continue;
      }

      const hpFill = card.querySelector('[data-meter-fill="hp"]');
      const staminaFill = card.querySelector('[data-meter-fill="stamina"]');
      const xpFill = card.querySelector('.selection-section--xp [data-meter-fill="xp"]');

      meterState.set(unitId, {
        hp: Number(hpFill?.dataset.meterValue),
        stamina: Number(staminaFill?.dataset.meterValue),
        xp: Number(xpFill?.dataset.meterValue)
      });
    }

    return meterState;
  },

  animateBattleMeters(previousMeterState) {
    if (
      !previousMeterState?.size ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    for (const card of this.root.querySelectorAll("[data-selection-unit-card]")) {
      const unitId = card.dataset.selectionUnitCard;

      if (!unitId) {
        continue;
      }

      const previousMeter = previousMeterState.get(unitId);

      if (!previousMeter) {
        continue;
      }

      const hpFill = card.querySelector('[data-meter-fill="hp"]');
      const nextHp = Number(hpFill?.dataset.meterValue);

      if (Number.isFinite(previousMeter.hp) && Number.isFinite(nextHp) && previousMeter.hp !== nextHp) {
        this.animateBattleMeterFill(hpFill, previousMeter.hp, nextHp, {
          duration: BATTLE_HP_METER_ANIMATION_MS,
          emphasisClass: nextHp < previousMeter.hp ? "is-animating-loss" : "is-animating-gain"
        });
      }

      const staminaFill = card.querySelector('[data-meter-fill="stamina"]');
      const nextStamina = Number(staminaFill?.dataset.meterValue);

      if (
        Number.isFinite(previousMeter.stamina) &&
        Number.isFinite(nextStamina) &&
        previousMeter.stamina !== nextStamina
      ) {
        this.animateBattleMeterFill(staminaFill, previousMeter.stamina, nextStamina, {
          duration: BATTLE_HP_METER_ANIMATION_MS,
          emphasisClass:
            nextStamina < previousMeter.stamina ? "is-animating-loss" : "is-animating-gain"
        });
      }
    }
  },

  animateBattleMeterFill(fill, from, to, { duration, emphasisClass } = {}) {
    if (!fill || !Number.isFinite(from) || !Number.isFinite(to) || Math.abs(from - to) < 0.1) {
      return;
    }

    fill.style.transition = "none";
    fill.style.width = `${from}%`;
    fill.classList.remove("is-animating-loss", "is-animating-gain");
    void fill.offsetWidth;

    if (emphasisClass) {
      fill.classList.add(emphasisClass);
    }

    window.requestAnimationFrame(() => {
      fill.style.transition = `width ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      fill.style.width = `${to}%`;
    });

    window.setTimeout(() => {
      if (!document.body.contains(fill)) {
        return;
      }

      fill.style.transition = "";
      fill.classList.remove("is-animating-loss", "is-animating-gain");
    }, duration + 140);
  }
};
