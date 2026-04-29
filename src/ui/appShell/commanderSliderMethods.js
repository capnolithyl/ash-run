import { SCREEN_IDS } from "../../game/core/constants.js";
import { getVisibleLoopedIndices, normalizeLoopedIndex } from "./shared.js";

export const appShellCommanderSliderMethods = {
  scrollCommanderSlider(direction) {
    this.scrollCommanderSliderById("new-run", direction);
  },

  scrollCommanderSliderById(sliderId, direction) {
    const metrics = this.getCommanderSliderMetrics(sliderId);
    const sliderState = this.getCommanderSliderState(metrics?.id);

    if (!metrics || !metrics.realCount) {
      return;
    }

    if (sliderState.transitioning) {
      return;
    }

    if (!Number.isInteger(sliderState.trackIndex)) {
      sliderState.trackIndex = metrics.homeStartIndex;
    }

    sliderState.trackIndex += direction;
    sliderState.transitioning = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.setCommanderSliderTrackPosition(metrics, sliderState.trackIndex, {
      animate: sliderState.transitioning
    });
  },

  syncCommanderSlider(state, options = {}) {
    this.syncCommanderSliderById("new-run", state, options);
  },

  syncCommanderSliders(state, options = {}) {
    for (const viewport of this.root.querySelectorAll('[data-role="commander-slider"]')) {
      this.syncCommanderSliderById(this.getCommanderSliderId(viewport), state, options);
    }
  },

  syncCommanderSliderById(sliderId, state, options = {}) {
    const metrics = this.getCommanderSliderMetrics(sliderId);
    const sliderState = this.getCommanderSliderState(metrics?.id);

    if (!metrics || !metrics.realCount) {
      return;
    }

    const selectedCommanderId = this.getSelectedCommanderIdForSlider(metrics.id, state);
    const selectedIndex = metrics.realSlides.findIndex(
      (card) => card.dataset.commanderId === selectedCommanderId
    );
    const fallbackIndex = selectedIndex >= 0 ? selectedIndex : 0;

    if (!Number.isInteger(sliderState.trackIndex) || options.forceCurrentIndex) {
      const normalizedIndex = Number.isInteger(sliderState.trackIndex)
        ? normalizeLoopedIndex(sliderState.trackIndex - metrics.homeStartIndex, metrics.realCount)
        : fallbackIndex;
      sliderState.trackIndex = metrics.homeStartIndex + normalizedIndex;
      this.setCommanderSliderTrackPosition(metrics, sliderState.trackIndex, {
        animate: options.behavior === "smooth"
      });
      return;
    }

    const currentStartIndex = normalizeLoopedIndex(
      sliderState.trackIndex - metrics.homeStartIndex,
      metrics.realCount
    );
    const visibleIndices = new Set(
      getVisibleLoopedIndices(currentStartIndex, metrics.visibleCount, metrics.realCount)
    );

    if (selectedIndex >= 0 && !visibleIndices.has(selectedIndex)) {
      sliderState.trackIndex = metrics.homeStartIndex + selectedIndex;
      this.setCommanderSliderTrackPosition(metrics, sliderState.trackIndex, {
        animate: options.behavior === "smooth"
      });
      return;
    }

    this.setCommanderSliderTrackPosition(metrics, sliderState.trackIndex, {
      animate: false
    });
  },

  getSelectedCommanderIdForSlider(sliderId, state) {
    if (sliderId === "skirmish-player") {
      return state.skirmishSetup?.playerCommanderId;
    }

    if (sliderId === "skirmish-enemy") {
      return state.skirmishSetup?.enemyCommanderId;
    }

    return state.selectedCommanderId;
  },

  getCommanderSliderState(sliderId = "new-run") {
    if (!this.commanderSliderStates.has(sliderId)) {
      this.commanderSliderStates.set(sliderId, {
        trackIndex: null,
        transitioning: false
      });
    }

    return this.commanderSliderStates.get(sliderId);
  },

  getCommanderSliderId(element) {
    return element?.dataset?.commanderSliderId || "new-run";
  },

  getCommanderSliderVisibleCount(slider) {
    const styles = window.getComputedStyle(slider);
    const rawValue = Number.parseInt(styles.getPropertyValue("--commander-visible-count"), 10);
    return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 1;
  },

  getCommanderSliderMetrics(sliderId = "new-run") {
    const viewport = Array.from(this.root.querySelectorAll('[data-role="commander-slider"]')).find(
      (candidate) => this.getCommanderSliderId(candidate) === sliderId
    );
    const track = Array.from(this.root.querySelectorAll('[data-role="commander-slider-track"]')).find(
      (candidate) => this.getCommanderSliderId(candidate) === sliderId
    );

    if (!viewport || !track) {
      return null;
    }

    const cards = Array.from(track.querySelectorAll("[data-slide-index]"));
    const copyCount = Number.parseInt(track.dataset.sliderCopyCount ?? "1", 10);
    const homeCopyIndex = Number.parseInt(track.dataset.sliderHomeCopyIndex ?? "0", 10);
    const realCount = copyCount > 0 ? Math.floor(cards.length / copyCount) : 0;
    const homeStartIndex = Math.max(0, homeCopyIndex * realCount);
    const realSlides = cards.slice(homeStartIndex, homeStartIndex + realCount);
    const firstCard = cards[0] ?? null;
    const trackStyles = window.getComputedStyle(track);
    const columnGap = Number.parseFloat(trackStyles.columnGap || trackStyles.gap || "0");
    const slideWidth = firstCard?.getBoundingClientRect().width ?? 0;

    return {
      id: sliderId,
      viewport,
      track,
      cards,
      realSlides,
      copyCount: Number.isFinite(copyCount) && copyCount > 0 ? copyCount : 1,
      homeCopyIndex: Number.isFinite(homeCopyIndex) && homeCopyIndex >= 0 ? homeCopyIndex : 0,
      homeStartIndex,
      realCount,
      visibleCount: this.getCommanderSliderVisibleCount(viewport),
      step: slideWidth + (Number.isFinite(columnGap) ? columnGap : 0)
    };
  },

  setCommanderSliderTrackPosition(metrics, trackIndex, { animate }) {
    if (!metrics.track || !metrics.step) {
      return;
    }

    const useInstantPositioning =
      !animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    metrics.track.classList.toggle("commander-slider__track--instant", useInstantPositioning);
    metrics.track.style.transform = `translate3d(${-trackIndex * metrics.step}px, 0, 0)`;

    if (useInstantPositioning) {
      void metrics.track.getBoundingClientRect();
      metrics.track.classList.remove("commander-slider__track--instant");
      this.getCommanderSliderState(metrics.id).transitioning = false;
    }
  },

  handleTransitionEnd(event) {
    if (
      this.latestState?.screen !== SCREEN_IDS.COMMANDER_SELECT &&
      this.latestState?.screen !== SCREEN_IDS.SKIRMISH_SETUP
    ) {
      return;
    }

    const track = event.target.closest?.('[data-role="commander-slider-track"]');

    if (!track || event.propertyName !== "transform") {
      return;
    }

    const metrics = this.getCommanderSliderMetrics(this.getCommanderSliderId(track));
    const sliderState = this.getCommanderSliderState(metrics?.id);

    if (!metrics || !Number.isInteger(sliderState.trackIndex)) {
      if (metrics) {
        sliderState.transitioning = false;
      }
      return;
    }

    const minimumHomeIndex = metrics.homeStartIndex;
    const maximumHomeIndex = metrics.homeStartIndex + metrics.realCount - 1;

    if (
      sliderState.trackIndex >= minimumHomeIndex &&
      sliderState.trackIndex <= maximumHomeIndex
    ) {
      sliderState.transitioning = false;
      return;
    }

    const normalizedIndex = normalizeLoopedIndex(
      sliderState.trackIndex - metrics.homeStartIndex,
      metrics.realCount
    );
    sliderState.trackIndex = metrics.homeStartIndex + normalizedIndex;
    this.setCommanderSliderTrackPosition(metrics, sliderState.trackIndex, {
      animate: false
    });
  }
};
