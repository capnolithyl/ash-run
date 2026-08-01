export const UI_AUDIO_CUES = Object.freeze({
  HOVER: "ui.hover",
  CONFIRM: "ui.confirm",
  CANCEL: "ui.cancel",
  DANGER: "ui.danger",
  ADJUST: "ui.adjust"
});

const CANCEL_ACTIONS = new Set([
  "back-to-title",
  "back-to-commander-select",
  "skirmish-previous-step",
  "skip-tutorial",
  "revert-display-settings",
  "return-windowed-display",
  "resume-battle",
  "cancel-abandon-run",
  "close-run-cards",
  "cancel-attack",
  "cancel-transport-choice",
  "cancel-support-choice",
  "cancel-medpack-choice",
  "cancel-extinguish-choice",
  "cancel-unload-choice",
  "redo-move",
  "map-editor-undo",
  "map-editor-close-load-dialog",
  "map-editor-cancel-history-revert",
  "discard-run-gear"
]);

const DANGER_ACTIONS = new Set([
  "quit-game",
  "prompt-abandon-run",
  "confirm-abandon-run",
  "delete-slot",
  "map-editor-new",
  "map-editor-delete-reinforcement-wave",
  "map-editor-request-history-revert",
  "map-editor-confirm-history-revert",
  "debug-clear-run-cards"
]);

const ADJUST_ACTIONS = new Set([
  "commander-slider-prev",
  "commander-slider-next",
  "scroll-skirmish-commanders",
  "select-commander",
  "select-slot",
  "select-skirmish-player-commander",
  "select-skirmish-enemy-commander",
  "select-skirmish-map",
  "select-options-tab",
  "select-debug-tool",
  "select-next-unit",
  "run-loadout-add",
  "run-loadout-remove",
  "open-run-cards",
  "map-editor-select-tool",
  "map-editor-select-terrain",
  "map-editor-select-building",
  "map-editor-select-building-owner",
  "map-editor-select-unit",
  "map-editor-select-unit-owner",
  "map-editor-select-reinforcement-unit",
  "map-editor-select-reinforcement-wave",
  "map-editor-select-load-entry",
  "map-editor-set-mirror-mode",
  "map-editor-set-variant-stage",
  "map-editor-restore-last-terrain",
  "map-editor-restore-last-building",
  "map-editor-restore-last-unit",
  "map-editor-goal-use-selected-building",
  "map-editor-goal-clear-target"
]);

const GAMEPLAY_ROUTED_ACTIONS = new Set([
  "end-turn",
  "activate-power",
  "recruit-unit",
  "select-next-unit",
  "begin-attack",
  "cancel-attack",
  "cancel-transport-choice",
  "cancel-support-choice",
  "cancel-medpack-choice",
  "cancel-extinguish-choice",
  "cancel-unload-choice",
  "capture-building",
  "use-supply",
  "rescue-hostage",
  "drop-off-hostage",
  "use-support",
  "use-medpack",
  "use-extinguish",
  "enter-transport",
  "begin-unload",
  "redo-move"
]);

export function isGameplayAudioRoutedAction(action) {
  return GAMEPLAY_ROUTED_ACTIONS.has(action);
}

export const UI_AUDIO_CLICK_SELECTOR = [
  "[data-action]",
  "[data-window-action]",
  "[data-tooltip-trigger]",
  ".selection-loadout-card__info",
  "summary"
].join(",");

export const UI_AUDIO_HOVER_SELECTOR = [
  UI_AUDIO_CLICK_SELECTOR,
  "select",
  'input[type="range"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  "label[for]",
  "label.option-row",
  ".unit-color-swatch"
].join(",");

export function classifyUiActionAudioCue(action, element = null) {
  const windowAction = element?.dataset?.windowAction;

  if (windowAction === "close") {
    return UI_AUDIO_CUES.DANGER;
  }

  if (windowAction) {
    return UI_AUDIO_CUES.ADJUST;
  }

  if (
    element?.dataset?.tooltipTrigger ||
    element?.classList?.contains?.("selection-loadout-card__info") ||
    element?.tagName === "SUMMARY"
  ) {
    return UI_AUDIO_CUES.ADJUST;
  }

  if (CANCEL_ACTIONS.has(action)) {
    return UI_AUDIO_CUES.CANCEL;
  }

  if (DANGER_ACTIONS.has(action)) {
    return UI_AUDIO_CUES.DANGER;
  }

  if (ADJUST_ACTIONS.has(action)) {
    return UI_AUDIO_CUES.ADJUST;
  }

  return UI_AUDIO_CUES.CONFIRM;
}

function getNestedFormControl(element) {
  if (!element?.querySelector) {
    return null;
  }

  return element.querySelector("input, select, button, textarea");
}

export function isAudioFeedbackElementEnabled(element) {
  if (!element || element.disabled || element.readOnly) {
    return false;
  }

  if (
    element.getAttribute?.("aria-disabled") === "true" ||
    element.getAttribute?.("aria-hidden") === "true"
  ) {
    return false;
  }

  const nestedControl = getNestedFormControl(element);

  return !nestedControl?.disabled && nestedControl?.getAttribute?.("aria-disabled") !== "true";
}

export function getAudioFeedbackElement(target, selector = UI_AUDIO_HOVER_SELECTOR) {
  const element = target?.closest?.(selector) ?? null;

  if (!element) {
    return null;
  }

  const wrappingLabel = element.closest?.("label");

  if (wrappingLabel?.matches?.(selector)) {
    return wrappingLabel;
  }

  return element;
}

export function getAudioFeedbackKey(element) {
  if (!element) {
    return "unknown";
  }

  const dataset = element.dataset ?? {};
  const nestedControl = getNestedFormControl(element);
  const nestedDataset = nestedControl?.dataset ?? {};

  return [
    dataset.action ?? nestedDataset.action,
    dataset.windowAction,
    dataset.tooltipTrigger,
    dataset.option ?? nestedDataset.option,
    dataset.displayOption ?? nestedDataset.displayOption,
    dataset.mapEditorField ?? nestedDataset.mapEditorField,
    dataset.skirmishField ?? nestedDataset.skirmishField,
    dataset.commanderId,
    dataset.slotId,
    element.getAttribute?.("aria-label"),
    element.textContent?.trim?.()
  ].find(Boolean) ?? element.tagName?.toLowerCase?.() ?? "control";
}
