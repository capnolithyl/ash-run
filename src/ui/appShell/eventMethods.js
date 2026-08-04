import { SCREEN_IDS } from "../../game/core/constants.js";
import {
  getSandboxMapFamilies,
  resolveSandboxMapId
} from "../../game/content/maps.js";
import {
  classifyUiActionAudioCue,
  getAudioFeedbackElement,
  getAudioFeedbackKey,
  isAudioFeedbackElementEnabled,
  isGameplayAudioRoutedAction,
  UI_AUDIO_CLICK_SELECTOR,
  UI_AUDIO_CUES,
  UI_AUDIO_HOVER_SELECTOR
} from "./audioFeedback.js";
import { DEBUG_SPAWN_STAT_DATASETS, delay } from "./shared.js";

export const appShellEventMethods = {
  applyFieldManualFilter() {
    const manual = this.root.querySelector("[data-field-manual]");
    if (!manual) {
      return false;
    }

    const query = String(manual.querySelector("[data-manual-query]")?.value ?? "").trim().toLowerCase();
    const activeFilter = manual.querySelector('[data-manual-filter][aria-pressed="true"]')?.dataset.manualFilter ?? "all";
    let visibleCount = 0;

    for (const manualEntry of manual.querySelectorAll("[data-manual-entry]")) {
      const matchesQuery = !query || String(manualEntry.dataset.manualSearchText ?? "").includes(query);
      const tags = String(manualEntry.dataset.manualTags ?? "").split(/\s+/);
      const matchesFilter = activeFilter === "all" || tags.includes(activeFilter);
      manualEntry.hidden = !(matchesQuery && matchesFilter);
      if (!manualEntry.hidden) visibleCount += 1;
    }

    for (const manualSection of manual.querySelectorAll("[data-manual-section]")) {
      manualSection.hidden = !manualSection.querySelector("[data-manual-entry]:not([hidden])");
    }

    const results = manual.querySelector("[data-manual-results]");
    if (results) results.textContent = `${visibleCount} ${visibleCount === 1 ? "entry" : "entries"}`;
    const empty = manual.querySelector("[data-manual-empty]");
    if (empty) empty.hidden = visibleCount > 0;
    return true;
  },

  selectOptionsTab(tabId, { focus = false, scope = "options" } = {}) {
    const tabsRoot = this.root.querySelector?.(`[data-options-tabs="${scope}"]`) ?? this.root;
    const tabs = [...tabsRoot.querySelectorAll('[role="tab"][data-options-tab]')];
    const tabIds = tabs.map((tab) => tab.dataset.optionsTab);

    if (!tabIds.includes(tabId)) {
      return false;
    }

    if (scope === "battle-pause") {
      this.activeBattlePauseTab = tabId;
    } else {
      this.activeOptionsTab = tabId;
    }

    for (const tab of tabs) {
      const isActive = tab.dataset.optionsTab === tabId;
      tab.classList.toggle("options-tabs__tab--active", isActive);
      tab.setAttribute("aria-selected", `${isActive}`);
      tab.tabIndex = isActive ? 0 : -1;

      if (isActive && focus) {
        tab.focus();
      }
    }

    for (const panel of tabsRoot.querySelectorAll('[role="tabpanel"][id^="options-panel-"]')) {
      panel.hidden = panel.id !== `options-panel-${tabId}`;
    }

    return true;
  },

  selectDebugTool(toolId, { focus = false } = {}) {
    const cards = [...this.root.querySelectorAll("[data-debug-tool]")];

    if (!cards.some((card) => card.dataset.debugTool === toolId)) {
      return false;
    }

    this.battleDrawers.debugTool = toolId;

    for (const card of cards) {
      const isActive = card.dataset.debugTool === toolId;
      card.classList.toggle("debug-tool-card--active", isActive);
      card.setAttribute("aria-current", `${isActive}`);

      if (isActive && focus) {
        card.focus();
      }
    }

    for (const panel of this.root.querySelectorAll("[data-battle-debug-panel]")) {
      panel.hidden = panel.dataset.battleDebugPanel !== toolId;
    }

    return true;
  },

  handleKeyDown(event) {
    const tutorialTab = event.target.closest?.('[role="tab"][data-tutorial-tab]');

    if (tutorialTab?.dataset?.tutorialTab) {
      const tabs = [...this.root.querySelectorAll('[role="tab"][data-tutorial-tab]')];
      const currentIndex = tabs.indexOf(tutorialTab);
      let nextIndex = currentIndex;
      if (["ArrowDown", "ArrowRight"].includes(event.key)) nextIndex = (currentIndex + 1) % tabs.length;
      else if (["ArrowUp", "ArrowLeft"].includes(event.key)) nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      this.controller.selectTutorialTab(tabs[nextIndex].dataset.tutorialTab);
      return;
    }

    const activeTab = event.target.closest?.('[role="tab"][data-options-tab]');

    if (activeTab) {
      const scope = activeTab.dataset.optionsScope ?? "options";
      const tabsRoot = activeTab.closest?.("[data-options-tabs]") ?? this.root;
      const tabIds = [...tabsRoot.querySelectorAll('[role="tab"][data-options-tab]')]
        .map((tab) => tab.dataset.optionsTab);
      const currentIndex = tabIds.indexOf(activeTab.dataset.optionsTab);
      let nextIndex = currentIndex;

      if (currentIndex < 0) {
        return;
      }

      switch (event.key) {
        case "ArrowDown":
        case "ArrowRight":
          nextIndex = (currentIndex + 1) % tabIds.length;
          break;
        case "ArrowUp":
        case "ArrowLeft":
          nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = tabIds.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      this.selectOptionsTab(tabIds[nextIndex], { focus: true, scope });
      return;
    }

    const activeDebugTool = event.target.closest?.("[data-debug-tool]");

    if (!activeDebugTool) {
      return;
    }

    const toolIds = [...this.root.querySelectorAll("[data-debug-tool]")]
      .map((tool) => tool.dataset.debugTool);
    const currentIndex = toolIds.indexOf(activeDebugTool.dataset.debugTool);
    let nextIndex = currentIndex;

    if (currentIndex < 0) {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % toolIds.length;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + toolIds.length) % toolIds.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = toolIds.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.selectDebugTool(toolIds[nextIndex], { focus: true });
  },

  syncSandboxStageField() {
    const familyField = this.root.querySelector('[data-debug-field="sandbox-map-family"]');
    const stageField = this.root.querySelector('[data-debug-field="sandbox-stage"]');
    const help = this.root.querySelector("[data-debug-stage-help]");
    const family = getSandboxMapFamilies().find((candidate) => candidate.id === familyField?.value);

    if (!familyField || !stageField || !family) {
      return false;
    }

    const stages = family.stages.map((candidate) => candidate.stage);
    const currentStage = Number(stageField.value);

    if (!stages.includes(currentStage)) {
      stageField.value = `${stages[0] ?? 1}`;
    }

    stageField.min = `${Math.min(...stages)}`;
    stageField.max = `${Math.max(...stages)}`;
    stageField.step = "1";

    if (help) {
      help.textContent = `Available: ${stages.join(", ")}`;
    }

    this.resolveDebugSandboxMapId();
    return true;
  },

  resolveDebugSandboxMapId({ report = false } = {}) {
    const familyField = this.root.querySelector('[data-debug-field="sandbox-map-family"]');
    const stageField = this.root.querySelector('[data-debug-field="sandbox-stage"]');
    const error = this.root.querySelector("[data-debug-map-error]");
    const size = this.root.querySelector("[data-debug-battlefield-size]");
    const family = getSandboxMapFamilies().find((candidate) => candidate.id === familyField?.value);
    const stage = Number(stageField?.value);
    const stageDefinition = family?.stages.find((candidate) => candidate.stage === stage) ?? null;
    const mapId = family ? resolveSandboxMapId(family.id, stage) : null;
    const message = mapId
      ? ""
      : family
        ? `Stage ${stageField?.value || "?"} is unavailable for ${family.name}. Available: ${family.stages.map((candidate) => candidate.stage).join(", ")}.`
        : "Choose an available sandbox map.";

    stageField?.setCustomValidity?.(message);

    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }

    if (size) {
      size.textContent = stageDefinition
        ? `${stageDefinition.width}x${stageDefinition.height}`
        : "No stage selected";
    }

    if (message && report) {
      stageField?.focus?.();
      stageField?.reportValidity?.();
    }

    return mapId;
  },

  getDesktopApi() {
    return globalThis.ashRun84Api ?? null;
  },

  downloadMapEditorJson(exportedMap) {
    const blob = new Blob([exportedMap.text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportedMap.filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  logDesktopDialogFallback(action, error) {
    console.warn(
      `Map editor ${action} dialog unavailable in the current Electron main process. Falling back.`,
      error
    );
  },

  syncMapEditorNameDraft(value) {
    const headerTitle = this.root.querySelector(
      "[data-map-editor-live-name], .map-editor-meta__title, .map-editor-header__copy h2"
    );

    if (headerTitle) {
      headerTitle.textContent = String(value ?? "").trimStart() || "Untitled Map";
    }
  },

  getDebugField(field, fallback = "") {
    return this.root.querySelector(`[data-debug-field="${field}"]`)?.value ?? fallback;
  },

  getDebugNumberField(field, fallback = 0) {
    const parsed = Number(this.getDebugField(field, fallback));
    return Number.isFinite(parsed) ? parsed : fallback;
  },

  syncDebugSpawnStatFields() {
    const unitTypeSelect = this.root.querySelector('[data-debug-field="spawn-unit-type"]');
    const selectedOption = unitTypeSelect?.selectedOptions?.[0];

    if (!selectedOption) {
      return;
    }

    for (const [field, datasetKey] of DEBUG_SPAWN_STAT_DATASETS) {
      const input = this.root.querySelector(`[data-debug-field="${field}"]`);

      if (input) {
        input.value = selectedOption.dataset[datasetKey] ?? "";
      }
    }

    const gearSelect = this.root.querySelector('[data-debug-field="spawn-gear-slot"]');

    if (!gearSelect) {
      return;
    }

    const selectedFamily = selectedOption.dataset.family ?? "";

    for (const option of gearSelect.options) {
      if (!option.value) {
        option.disabled = false;
        continue;
      }

      option.disabled =
        Boolean(option.dataset.eligibleFamily) && option.dataset.eligibleFamily !== selectedFamily;
    }

    if (gearSelect.selectedOptions[0]?.disabled) {
      gearSelect.value = "";
    }
  },

  async handleContextMenu(event) {
    if (
      this.latestState?.screen !== SCREEN_IDS.BATTLE ||
      !event.target?.closest?.(".battle-shell")
    ) {
      return;
    }

    event.preventDefault();
    await this.controller.handleBattleContextAction();
  },

  handleAudioPointerOver(event) {
    const trigger = getAudioFeedbackElement(event.target, UI_AUDIO_HOVER_SELECTOR);

    if (
      !isAudioFeedbackElementEnabled(trigger) ||
      trigger.contains?.(event.relatedTarget)
    ) {
      return;
    }

    this.controller.emitAudioCue?.(UI_AUDIO_CUES.HOVER, {
      dedupeKey: `hover:${getAudioFeedbackKey(trigger)}`,
      source: "dom-hover",
      userInitiated: false
    });
  },

  handleToggle(event) {
    if (this.latestState?.screen !== SCREEN_IDS.MAP_EDITOR) {
      return;
    }

    const accordion = event.target;

    if (!accordion?.matches?.("details[data-map-editor-accordion], details[data-map-editor-load-group]")) {
      return;
    }

    this.captureMapEditorUiState();
  },

  async handleClick(event) {
    const trigger = getAudioFeedbackElement(event.target, UI_AUDIO_CLICK_SELECTOR);

    if (!trigger || !this.latestState || !isAudioFeedbackElementEnabled(trigger)) {
      return;
    }

    const {
      action,
      commanderId,
      debugTool,
      lessonId,
      manualFilter,
      optionsScope,
      optionsTab,
      slotId,
      tutorialChoice,
      tutorialTab,
      unitTypeId
    } = trigger.dataset;
    const isCommanderSelection = [
      "select-commander",
      "select-skirmish-player-commander",
      "select-skirmish-enemy-commander"
    ].includes(action);

    if (
      isCommanderSelection &&
      this.commanderSliderSuppressClick &&
      trigger.closest?.('[data-role="commander-slider"]')
    ) {
      this.commanderSliderSuppressClick = false;
      event.preventDefault?.();
      return;
    }

    if (!isGameplayAudioRoutedAction(action)) {
      const cueId = classifyUiActionAudioCue(action, trigger);
      this.controller.emitAudioCue?.(cueId, {
        dedupeKey: `click:${action ?? getAudioFeedbackKey(trigger)}`,
        source: "dom-click"
      });
    }

    if (!action) {
      return;
    }

    switch (action) {
      case "select-options-tab":
        this.selectOptionsTab(optionsTab, { scope: optionsScope ?? "options" });
        break;
      case "select-debug-tool":
        this.selectDebugTool(debugTool);
        break;
      case "open-new-run":
        await this.controller.openNewRun();
        break;
      case "open-continue":
        this.controller.openContinue();
        break;
      case "open-skirmish":
        this.controller.openSkirmish();
        break;
      case "open-tutorial":
        this.controller.openTutorial();
        break;
      case "resolve-tutorial-prompt":
        await this.controller.resolveTutorialPrompt(tutorialChoice);
        break;
      case "select-tutorial-tab":
        this.controller.selectTutorialTab(tutorialTab);
        break;
      case "start-tutorial-lesson":
        this.controller.startTutorialLesson(lessonId);
        break;
      case "continue-new-run-from-tutorial":
        await this.controller.continueFromTutorialToNewRun();
        break;
      case "filter-field-manual":
        for (const filterButton of this.root.querySelectorAll("[data-manual-filter]")) {
          const active = filterButton.dataset.manualFilter === manualFilter;
          filterButton.classList.toggle("field-manual-filter--active", active);
          filterButton.setAttribute("aria-pressed", `${active}`);
        }
        this.applyFieldManualFilter();
        break;
      case "start-tutorial":
        this.controller.startTutorialBattle();
        break;
      case "tutorial-next":
        this.controller.continueTutorialStep();
        break;
      case "skip-tutorial":
        this.controller.skipTutorial();
        break;
      case "tutorial-epilogue":
        this.controller.openTutorialEpilogue();
        break;
      case "open-map-editor":
        this.controller.openMapEditor();
        break;
      case "open-options":
        this.controller.openOptions();
        break;
      case "open-progression":
        this.controller.openProgression();
        break;
      case "open-run-loadout":
        this.controller.openRunLoadout();
        break;
      case "apply-display-settings":
        await this.applyDisplaySettings();
        break;
      case "keep-display-settings":
        await this.keepDisplaySettings();
        break;
      case "revert-display-settings":
        await this.revertDisplaySettings();
        break;
      case "return-windowed-display":
        await this.returnToWindowedDisplay();
        break;
      case "purchase-unit-unlock":
        this.controller.purchaseUnitUnlock(unitTypeId);
        break;
      case "purchase-card-unlock":
        this.controller.purchaseRunCardUnlock(trigger.dataset.cardId);
        break;
      case "open-debug-run":
        this.controller.startDebugRun();
        break;
      case "back-to-title":
        await this.controller.returnToTitle();
        break;
      case "pause-battle":
        this.controller.openPauseMenu();
        break;
      case "resume-battle":
        this.controller.closePauseMenu();
        break;
      case "open-pause-field-manual":
        this.controller.openTutorialManualFromPause();
        break;
      case "close-pause-field-manual":
        this.controller.closeTutorialManualFromPause();
        break;
      case "prompt-abandon-run":
        this.controller.promptAbandonRun();
        break;
      case "cancel-abandon-run":
        this.controller.cancelAbandonRun();
        break;
      case "confirm-abandon-run":
        await this.controller.abandonRun();
        break;
      case "acknowledge-level-up": {
        const overlay = this.root.querySelector(".battle-overlay--level-up");
        const card = overlay?.querySelector(".overlay-card--level-up");
        overlay?.classList.add("battle-overlay--closing");
        card?.classList.add("overlay-card--closing");
        await delay(220);
        await this.controller.acknowledgeLevelUp();
        break;
      }
      case "quit-game":
        await this.controller.quitGame();
        break;
      case "select-commander":
        if (trigger.getAttribute("aria-disabled") === "true") {
          return;
        }
        this.controller.selectCommander(commanderId);
        break;
      case "commander-slider-prev":
        this.scrollCommanderSlider(-1);
        break;
      case "commander-slider-next":
        this.scrollCommanderSlider(1);
        break;
      case "scroll-skirmish-commanders":
        this.scrollCommanderSliderById(
          trigger.dataset.commanderSliderId,
          Number(trigger.dataset.skirmishDirection)
        );
        break;
      case "select-slot":
        this.controller.selectSlot(slotId);
        break;
      case "start-run":
        await this.controller.startNewRun();
        break;
      case "open-run-naming-review":
        this.controller.openRunLoadoutNamingReview();
        break;
      case "close-run-naming-review":
        this.controller.closeRunLoadoutNamingReview();
        break;
      case "randomize-run-loadout-name":
        this.controller.randomizeRunLoadoutUnitName(trigger.dataset.unitId);
        break;
      case "back-to-commander-select":
        this.controller.returnToCommanderSelect();
        break;
      case "run-loadout-add":
        this.controller.addRunLoadoutUnit(unitTypeId);
        break;
      case "run-loadout-remove":
        this.controller.removeRunLoadoutUnit(unitTypeId);
        break;
      case "select-skirmish-player-commander":
        if (trigger.getAttribute("aria-disabled") === "true") {
          return;
        }
        this.controller.updateSkirmishSetup({ playerCommanderId: commanderId });
        break;
      case "select-skirmish-enemy-commander":
        if (trigger.getAttribute("aria-disabled") === "true") {
          return;
        }
        this.controller.updateSkirmishSetup({ enemyCommanderId: commanderId });
        break;
      case "select-skirmish-map":
        this.controller.updateSkirmishSetup({ mapId: trigger.dataset.mapId });
        break;
      case "skirmish-next-step":
        this.controller.updateSkirmishSetup({ step: "map" });
        break;
      case "skirmish-previous-step":
        this.controller.updateSkirmishSetup({ step: "commanders" });
        break;
      case "start-skirmish":
        await this.controller.startSkirmish();
        break;
      case "map-editor-new":
        this.controller.resetMapEditor();
        break;
      case "map-editor-select-tool":
        this.controller.setMapEditorTool(trigger.dataset.mapEditorTool);
        break;
      case "map-editor-select-terrain":
        this.controller.selectMapEditorTerrain(trigger.dataset.terrainId);
        break;
      case "map-editor-select-building":
        this.controller.selectMapEditorBuildingType(trigger.dataset.buildingType);
        break;
      case "map-editor-select-building-owner":
        this.controller.selectMapEditorBuildingOwner(trigger.dataset.buildingOwner);
        break;
      case "map-editor-select-unit":
        this.controller.selectMapEditorUnitType(trigger.dataset.unitTypeId);
        break;
      case "map-editor-select-unit-owner":
        this.controller.selectMapEditorUnitOwner(trigger.dataset.unitOwner);
        break;
      case "map-editor-select-reinforcement-unit":
        this.controller.selectMapEditorReinforcementUnitType(trigger.dataset.unitTypeId);
        break;
      case "map-editor-select-reinforcement-wave":
        this.controller.selectMapEditorReinforcementWave(trigger.dataset.reinforcementWaveId);
        break;
      case "map-editor-add-reinforcement-wave":
        this.controller.addMapEditorReinforcementWave();
        break;
      case "map-editor-delete-reinforcement-wave":
        this.controller.deleteSelectedMapEditorReinforcementWave();
        break;
      case "map-editor-reinforcement-use-selected-unit":
        this.controller.setMapEditorReinforcementTargetFromSelectedUnit();
        break;
      case "map-editor-restore-last-terrain":
        this.controller.restoreLastMapEditorTerrain?.();
        break;
      case "map-editor-restore-last-building":
        this.controller.restoreLastMapEditorBuilding?.();
        break;
      case "map-editor-restore-last-unit":
        this.controller.restoreLastMapEditorUnit?.();
        break;
      case "map-editor-set-mirror-mode":
        this.controller.setMapEditorMirrorMode(trigger.dataset.mirrorMode);
        break;
      case "map-editor-set-variant-stage":
        this.controller.setMapEditorVariantStage(Number(trigger.dataset.variantStage));
        break;
      case "map-editor-undo":
        this.controller.undoMapEditorHistory?.();
        break;
      case "map-editor-request-history-revert":
        this.controller.requestMapEditorHistoryRevert?.(Number(trigger.dataset.historyIndex));
        break;
      case "map-editor-confirm-history-revert":
        this.controller.confirmMapEditorHistoryRevert?.();
        break;
      case "map-editor-cancel-history-revert":
        this.controller.cancelMapEditorHistoryRevert?.();
        break;
      case "map-editor-goal-use-selected-building":
        this.controller.setMapEditorGoalTargetFromSelectedBuilding();
        break;
      case "map-editor-goal-clear-target":
        this.controller.clearMapEditorGoalTarget();
        break;
      case "map-editor-import":
        await this.controller.openMapEditorLoadDialog?.();
        break;
      case "map-editor-close-load-dialog":
        this.controller.closeMapEditorLoadDialog?.();
        break;
      case "map-editor-select-load-entry":
        this.controller.selectMapEditorLoadDialogEntry?.(trigger.dataset.mapRelativePath);
        break;
      case "map-editor-confirm-load":
        await this.controller.confirmMapEditorLoadDialog?.();
        break;
      case "map-editor-export": {
        const saveResult = await this.controller.saveMapEditorMap?.();

        if (saveResult?.mode === "download" && saveResult.exportedMap) {
          if (saveResult.warning) {
            this.logDesktopDialogFallback("export", saveResult.warning);
          }
          this.downloadMapEditorJson(saveResult.exportedMap);
          this.controller.showToast?.({
            title: "Map downloaded",
            message: `${saveResult.exportedMap.filename} was downloaded through the browser fallback.`,
            tone: "success"
          });
        }
        break;
      }
      case "load-slot":
        await this.controller.loadSlot(slotId);
        break;
      case "delete-slot":
        await this.controller.deleteSlot(slotId);
        break;
      case "end-turn":
        await this.controller.endTurn();
        break;
      case "activate-power":
        await this.controller.activatePower();
        break;
      case "recruit-unit":
        await this.controller.recruitUnit(unitTypeId);
        break;
      case "select-next-unit":
        await this.controller.selectNextReadyUnit();
        break;
      case "open-run-cards":
        this.controller.openRunCardsPanel();
        break;
      case "close-run-cards":
        this.controller.closeRunCardsPanel();
        break;
      case "wait-unit":
        await this.controller.waitWithSelectedUnit();
        break;
      case "begin-attack":
        await this.controller.beginSelectedAttack();
        break;
      case "cancel-attack":
        await this.controller.cancelSelectedAttack();
        break;
      case "cancel-transport-choice":
      case "cancel-air-strike":
      case "cancel-support-choice":
      case "cancel-medpack-choice":
      case "cancel-extinguish-choice":
      case "cancel-unload-choice":
        await this.controller.handleBattleContextAction();
        break;
      case "capture-building":
        await this.controller.captureWithSelectedUnit();
        break;
      case "use-supply":
        await this.controller.useSelectedSupply();
        break;
      case "rescue-hostage":
        await this.controller.rescueHostageWithSelectedUnit();
        break;
      case "drop-off-hostage":
        await this.controller.dropOffHostageWithSelectedUnit();
        break;
      case "use-support":
        await this.controller.useSelectedSupportAbility();
        break;
      case "use-medpack":
        await this.controller.useSelectedMedpack();
        break;
      case "use-extinguish":
        await this.controller.useSelectedExtinguish();
        break;
      case "enter-transport":
        await this.controller.enterSelectedTransport();
        break;
      case "begin-unload":
        await this.controller.beginSelectedUnload();
        break;
      case "redo-move":
        await this.controller.redoSelectedMove();
        break;
      case "advance-run":
        await this.controller.advanceRun();
        break;
      case "select-run-reward":
        await this.controller.selectRunReward(trigger.dataset.rewardId);
        break;
      case "randomize-pending-run-unit-name":
        await this.controller.randomizePendingRunUnitName();
        break;
      case "confirm-pending-run-unit-name":
        await this.controller.confirmPendingRunUnitName();
        break;
      case "equip-run-gear":
        await this.controller.equipPendingRunGear(trigger.dataset.unitId);
        break;
      case "discard-run-gear":
        await this.controller.discardPendingRunGear();
        break;
      case "debug-spawn-unit":
        await this.controller.debugSpawnUnit({
          owner: this.getDebugField("spawn-owner", "player"),
          unitTypeId: this.getDebugField("spawn-unit-type", "grunt"),
          x: this.getDebugNumberField("spawn-x", 0),
          y: this.getDebugNumberField("spawn-y", 0),
          gearSlot: this.getDebugField("spawn-gear-slot", ""),
          stats: {
            attack: this.getDebugNumberField("spawn-attack", NaN),
            armor: this.getDebugNumberField("spawn-armor", NaN),
            maxHealth: this.getDebugNumberField("spawn-max-health", NaN),
            movement: this.getDebugNumberField("spawn-movement", NaN),
            minRange: this.getDebugNumberField("spawn-min-range", NaN),
            maxRange: this.getDebugNumberField("spawn-max-range", NaN),
            staminaMax: this.getDebugNumberField("spawn-max-stamina", NaN),
            ammoMax: this.getDebugNumberField("spawn-max-ammo", NaN),
            luck: this.getDebugNumberField("spawn-luck", NaN)
          }
        });
        break;
      case "debug-apply-selected-stats":
        await this.controller.debugApplySelectedUnitStats({
          hp: this.getDebugNumberField("unit-hp", NaN),
          maxHealth: this.getDebugNumberField("unit-max-health", NaN),
          attack: this.getDebugNumberField("unit-attack", NaN),
          armor: this.getDebugNumberField("unit-armor", NaN),
          movement: this.getDebugNumberField("unit-movement", NaN),
          minRange: this.getDebugNumberField("unit-min-range", NaN),
          maxRange: this.getDebugNumberField("unit-max-range", NaN),
          stamina: this.getDebugNumberField("unit-stamina", NaN),
          staminaMax: this.getDebugNumberField("unit-max-stamina", NaN),
          ammo: this.getDebugNumberField("unit-ammo", NaN),
          ammoMax: this.getDebugNumberField("unit-max-ammo", NaN),
          luck: this.getDebugNumberField("unit-luck", NaN),
          level: this.getDebugNumberField("unit-level", NaN),
          experience: this.getDebugNumberField("unit-experience", NaN),
          gearSlot: this.getDebugField("unit-gear-slot", "")
        });
        break;
      case "debug-apply-commanders":
        await this.controller.debugSetCommanders({
          playerCommanderId: this.getDebugField("player-commander", "atlas"),
          enemyCommanderId: this.getDebugField("enemy-commander", "viper"),
          enemyAiArchetype: this.getDebugField("enemy-ai-archetype", "balanced")
        });
        break;
      case "debug-load-map":
        {
          const mapId = this.resolveDebugSandboxMapId({ report: true });

          if (mapId) {
            this.controller.startDebugRun({
              mapId,
              keepPauseMenuOpen: true
            });
          }
        }
        break;
      case "debug-full-charge-player":
        await this.controller.debugSetCharge("player", 9999);
        break;
      case "debug-full-charge-enemy":
        await this.controller.debugSetCharge("enemy", 9999);
        break;
      case "debug-refresh-player-actions":
        await this.controller.debugRefreshActions("player");
        break;
      case "debug-refresh-enemy-actions":
        await this.controller.debugRefreshActions("enemy");
        break;
      case "debug-add-run-card":
        await this.controller.debugAddRunCard(this.getDebugField("run-card-id", ""));
        break;
      case "debug-clear-run-cards":
        await this.controller.debugClearRunCards();
        break;
      default:
        break;
    }
  },

  async handleChange(event) {
    const optionKey = event.target.dataset.option;
    const shouldEmitAudio = isAudioFeedbackElementEnabled(event.target);

    if (shouldEmitAudio && !optionKey) {
      this.controller.emitAudioCue?.(UI_AUDIO_CUES.ADJUST, {
        dedupeKey: `change:${getAudioFeedbackKey(event.target)}`,
        source: "dom-change"
      });
    }

    if (event.target.dataset.runLoadoutUnitName) {
      this.controller.updateRunLoadoutUnitName(
        event.target.dataset.runLoadoutUnitName,
        event.target.value
      );
      return;
    }

    if (event.target.dataset.pendingRunUnitName !== undefined) {
      await this.controller.updatePendingRunUnitName(event.target.value);
      return;
    }

    if (this.handleDisplayOptionChange?.(event)) {
      return;
    }

    const skirmishField = event.target.dataset.skirmishField;

    if (skirmishField) {
      await this.controller.updateSkirmishSetup({
        [skirmishField]: Number(event.target.value)
      });
      return;
    }

    const mapEditorField = event.target.dataset.mapEditorField;

    if (mapEditorField) {
      this.setInputMode("mouse");
      this.controller.updateMapEditorField(mapEditorField, event.target.value);

      return;
    }

    if (event.target.dataset.debugField === "spawn-unit-type") {
      this.syncDebugSpawnStatFields();
      return;
    }

    if (event.target.dataset.debugField === "sandbox-map-family") {
      this.syncSandboxStageField();
      return;
    }

    if (event.target.dataset.debugField === "sandbox-stage") {
      this.resolveDebugSandboxMapId();
      return;
    }

    if (!optionKey) {
      return;
    }

    const nextValue =
      event.target.type === "checkbox"
        ? event.target.checked
        : event.target.type === "range" || event.target.type === "number"
          ? Number(event.target.value)
          : event.target.value;

    await this.controller.updateOptions({
      [optionKey]: nextValue
    });

    if (shouldEmitAudio) {
      this.controller.emitAudioCue?.(UI_AUDIO_CUES.ADJUST, {
        dedupeKey: `change:${getAudioFeedbackKey(event.target)}`,
        source: "dom-change"
      });
    }
  },

  handleInput(event) {
    if (event.target.matches?.("[data-manual-query]")) {
      this.applyFieldManualFilter();
      return;
    }

    const optionKey = event.target.dataset.option;

    if (optionKey && event.target.type === "range") {
      const value = Number(event.target.value);
      const valueLabel = event.target.closest?.(".option-row")?.querySelector?.("strong");

      if (valueLabel && Number.isFinite(value)) {
        valueLabel.textContent = `${Math.round(value * 100)}%`;
      }

      this.controller.previewAudioOptions?.({ [optionKey]: value });
      return;
    }

    const skirmishField = event.target.dataset.skirmishField;

    if (skirmishField) {
      const output = this.root.querySelector(`[data-skirmish-output="${skirmishField}"]`);

      if (output) {
        output.textContent = event.target.value;
      }

      return;
    }

    const mapEditorField = event.target.dataset.mapEditorField;

    if (!mapEditorField) {
      return;
    }

    this.setInputMode("mouse");

    if (mapEditorField === "name") {
      this.controller.updateMapEditorField(mapEditorField, event.target.value, { emit: false });
      this.syncMapEditorNameDraft(event.target.value);
    }
  }
};
