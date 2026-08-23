export const appShellUiStatePersistenceMethods = {
  captureBattleDrawerState() {
    const intelDrawer = this.root.querySelector("#battle-intel-drawer");
    const commandDrawer = this.root.querySelector("#battle-command-drawer");
    const missionDetailsToggle = this.root.querySelector('[data-action="toggle-mission-details"]');
    const selectedIntelTab = this.root.querySelector('[name="battle-intel-tab"]:checked');
    const selectedDebugTool = this.root.querySelector('[data-debug-tool][aria-current="true"]');
    const selectedPanel = this.root.querySelector(".battle-side-panel--selected");
    const targetPanel = this.root.querySelector(".battle-side-panel--target");
    const feedPanel = this.root.querySelector(".battle-side-panel--feed");
    const compactSelectedPanel = this.root.querySelector(".battle-compact-sheet__panel--selected");
    const compactTargetPanel = this.root.querySelector(".battle-compact-sheet__panel--target");
    const compactFeedPanel = this.root.querySelector(".battle-compact-sheet__panel--feed");
    const debugFields = [...this.root.querySelectorAll("[data-debug-field]")];

    if (intelDrawer) {
      this.battleDrawers.intel = intelDrawer.checked;
    }

    if (commandDrawer) {
      this.battleDrawers.command = commandDrawer.checked;
    }

    if (missionDetailsToggle) {
      this.battleDrawers.missionDetailsOpen =
        missionDetailsToggle.getAttribute("aria-expanded") === "true";
    }

    if (selectedIntelTab?.value) {
      this.battleDrawers.intelTab = selectedIntelTab.value;
    }

    if (selectedDebugTool?.dataset.debugTool) {
      this.battleDrawers.debugTool = selectedDebugTool.dataset.debugTool;
    }

    if (debugFields.length > 0) {
      this.battleDrawers.debugFieldValues = Object.fromEntries(
        debugFields.map((field) => [
          field.dataset.debugField,
          {
            value: field.value,
            checked: field.type === "checkbox" ? field.checked : null
          }
        ])
      );
    }
    this.battleDrawers.selectedPanelScrollTop = selectedPanel?.scrollTop ?? 0;
    this.battleDrawers.targetPanelScrollTop = targetPanel?.scrollTop ?? 0;
    this.battleDrawers.feedPanelScrollTop = feedPanel?.scrollTop ?? 0;
    this.battleDrawers.compactSelectedScrollTop = compactSelectedPanel?.scrollTop ?? 0;
    this.battleDrawers.compactTargetScrollTop = compactTargetPanel?.scrollTop ?? 0;
    this.battleDrawers.compactFeedScrollTop = compactFeedPanel?.scrollTop ?? 0;
  },

  applyBattleDrawerState() {
    const intelDrawer = this.root.querySelector("#battle-intel-drawer");
    const commandDrawer = this.root.querySelector("#battle-command-drawer");
    const selectedIntelTab = this.root.querySelector(
      `[name="battle-intel-tab"][value="${this.battleDrawers.intelTab ?? "selected"}"]`
    );
    const selectedPanel = this.root.querySelector(".battle-side-panel--selected");
    const targetPanel = this.root.querySelector(".battle-side-panel--target");
    const feedPanel = this.root.querySelector(".battle-side-panel--feed");
    const compactSelectedPanel = this.root.querySelector(".battle-compact-sheet__panel--selected");
    const compactTargetPanel = this.root.querySelector(".battle-compact-sheet__panel--target");
    const compactFeedPanel = this.root.querySelector(".battle-compact-sheet__panel--feed");
    const debugFieldValues = this.battleDrawers.debugFieldValues ?? {};

    if (intelDrawer) {
      intelDrawer.checked = this.battleDrawers.intel;
    }

    if (commandDrawer) {
      commandDrawer.checked = this.battleDrawers.command;
    }

    this.setMissionDetailsOpen?.(this.battleDrawers.missionDetailsOpen);

    if (selectedIntelTab) {
      selectedIntelTab.checked = true;
    }

    for (const field of this.root.querySelectorAll("[data-debug-field]")) {
      const savedField = debugFieldValues[field.dataset.debugField];

      if (!savedField) {
        continue;
      }

      field.value = savedField.value;

      if (savedField.checked !== null) {
        field.checked = savedField.checked;
      }
    }

    if (selectedPanel) {
      selectedPanel.scrollTop = this.battleDrawers.selectedPanelScrollTop ?? 0;
    }

    if (targetPanel) {
      targetPanel.scrollTop = this.battleDrawers.targetPanelScrollTop ?? 0;
    }

    if (feedPanel) {
      feedPanel.scrollTop = this.battleDrawers.feedPanelScrollTop ?? 0;
    }

    if (compactSelectedPanel) {
      compactSelectedPanel.scrollTop = this.battleDrawers.compactSelectedScrollTop ?? 0;
    }

    if (compactTargetPanel) {
      compactTargetPanel.scrollTop = this.battleDrawers.compactTargetScrollTop ?? 0;
    }

    if (compactFeedPanel) {
      compactFeedPanel.scrollTop = this.battleDrawers.compactFeedScrollTop ?? 0;
    }
  },

  captureMapEditorUiState() {
    const leftRail = this.root.querySelector('[data-map-editor-rail="left"]');
    const rightRail = this.root.querySelector('[data-map-editor-rail="right"]');
    const unitsGrid = this.root.querySelector('[data-map-editor-scroll="units"]');
    const loadDialogList = this.root.querySelector('[data-map-editor-load-list="true"]');
    const openAccordion = this.root.querySelector("details[data-map-editor-accordion][open]");
    const openLoadGroup = this.root.querySelector("details[data-map-editor-load-group][open]");
    const focusedField = globalThis.document?.activeElement;
    const isFocusedMapEditorField =
      focusedField &&
      this.root.contains(focusedField) &&
      focusedField.hasAttribute?.("data-map-editor-field");

    this.mapEditorUi.leftRailScrollTop = leftRail?.scrollTop ?? 0;
    this.mapEditorUi.rightRailScrollTop = rightRail?.scrollTop ?? 0;
    this.mapEditorUi.unitsScrollTop = unitsGrid?.scrollTop ?? 0;
    this.mapEditorUi.loadDialogListScrollTop = loadDialogList?.scrollTop ?? 0;
    this.mapEditorUi.openAccordion = openAccordion?.dataset.mapEditorAccordion ?? null;
    this.mapEditorUi.loadDialogOpenGroupKey = openLoadGroup?.dataset.mapEditorLoadGroup ?? null;
    this.mapEditorUi.focusedField = isFocusedMapEditorField
      ? {
          field: focusedField.dataset.mapEditorField,
          selectionStart:
            typeof focusedField.selectionStart === "number" ? focusedField.selectionStart : null,
          selectionEnd:
            typeof focusedField.selectionEnd === "number" ? focusedField.selectionEnd : null
        }
      : null;
  },

  captureSkirmishUiState() {
    const mapList = this.root.querySelector('[data-role="skirmish-map-list"]');
    this.skirmishUi.mapListScrollTop = mapList?.scrollTop ?? 0;
  },

  applyMapEditorUiState() {
    const leftRail = this.root.querySelector('[data-map-editor-rail="left"]');
    const rightRail = this.root.querySelector('[data-map-editor-rail="right"]');
    const unitsGrid = this.root.querySelector('[data-map-editor-scroll="units"]');
    const loadDialogList = this.root.querySelector('[data-map-editor-load-list="true"]');

    if (leftRail) {
      leftRail.scrollTop = this.mapEditorUi.leftRailScrollTop ?? 0;
    }

    if (rightRail) {
      rightRail.scrollTop = this.mapEditorUi.rightRailScrollTop ?? 0;
    }

    if (unitsGrid) {
      unitsGrid.scrollTop = this.mapEditorUi.unitsScrollTop ?? 0;
    }

    if (loadDialogList) {
      loadDialogList.scrollTop = this.mapEditorUi.loadDialogListScrollTop ?? 0;
    }

    if (this.mapEditorUi.loadDialogOpenGroupKey) {
      const openLoadGroup = this.root.querySelector(
        `details[data-map-editor-load-group="${CSS.escape(this.mapEditorUi.loadDialogOpenGroupKey)}"]`
      );

      if (openLoadGroup) {
        openLoadGroup.open = true;
      }
    }

    const focusedField = this.mapEditorUi.focusedField;

    if (!focusedField?.field) {
      return;
    }

    const nextField = this.root.querySelector(
      `[data-map-editor-field="${focusedField.field}"]`
    );

    if (!nextField) {
      return;
    }

    nextField.focus?.({ preventScroll: true });

    if (
      typeof focusedField.selectionStart === "number" &&
      typeof focusedField.selectionEnd === "number" &&
      typeof nextField.setSelectionRange === "function"
    ) {
      nextField.setSelectionRange(focusedField.selectionStart, focusedField.selectionEnd);
    }
  },

  applySkirmishUiState() {
    const mapList = this.root.querySelector('[data-role="skirmish-map-list"]');

    if (mapList) {
      mapList.scrollTop = this.skirmishUi.mapListScrollTop ?? 0;
    }
  },

  captureRunLoadoutTableScroll() {
    const tableShell = this.root.querySelector('[data-role="run-loadout-grid-shell"]');

    if (!tableShell) {
      return;
    }

    this.runLoadoutTableScroll = {
      top: tableShell.scrollTop,
      left: tableShell.scrollLeft
    };
  },

  applyRunLoadoutTableScroll() {
    const tableShell = this.root.querySelector('[data-role="run-loadout-grid-shell"]');

    if (!tableShell) {
      return;
    }

    tableShell.scrollTop = this.runLoadoutTableScroll.top ?? 0;
    tableShell.scrollLeft = this.runLoadoutTableScroll.left ?? 0;
  }
};
