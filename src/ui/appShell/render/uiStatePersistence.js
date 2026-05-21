export const appShellUiStatePersistenceMethods = {
  captureBattleDrawerState() {
    const intelDrawer = this.root.querySelector("#battle-intel-drawer");
    const commandDrawer = this.root.querySelector("#battle-command-drawer");
    const selectedIntelTab = this.root.querySelector('[name="battle-intel-tab"]:checked');

    if (intelDrawer) {
      this.battleDrawers.intel = intelDrawer.checked;
    }

    if (commandDrawer) {
      this.battleDrawers.command = commandDrawer.checked;
    }

    if (selectedIntelTab?.value) {
      this.battleDrawers.intelTab = selectedIntelTab.value;
    }
  },

  applyBattleDrawerState() {
    const intelDrawer = this.root.querySelector("#battle-intel-drawer");
    const commandDrawer = this.root.querySelector("#battle-command-drawer");
    const selectedIntelTab = this.root.querySelector(
      `[name="battle-intel-tab"][value="${this.battleDrawers.intelTab ?? "selected"}"]`
    );

    if (intelDrawer) {
      intelDrawer.checked = this.battleDrawers.intel;
    }

    if (commandDrawer) {
      commandDrawer.checked = this.battleDrawers.command;
    }

    if (selectedIntelTab) {
      selectedIntelTab.checked = true;
    }
  },

  captureMapEditorUiState() {
    const leftRail = this.root.querySelector('[data-map-editor-rail="left"]');
    const rightRail = this.root.querySelector('[data-map-editor-rail="right"]');
    const unitsGrid = this.root.querySelector('[data-map-editor-scroll="units"]');
    const openAccordion = this.root.querySelector("details[data-map-editor-accordion][open]");
    const focusedField = globalThis.document?.activeElement;
    const isFocusedMapEditorField =
      focusedField &&
      this.root.contains(focusedField) &&
      focusedField.hasAttribute?.("data-map-editor-field");

    this.mapEditorUi.leftRailScrollTop = leftRail?.scrollTop ?? 0;
    this.mapEditorUi.rightRailScrollTop = rightRail?.scrollTop ?? 0;
    this.mapEditorUi.unitsScrollTop = unitsGrid?.scrollTop ?? 0;
    this.mapEditorUi.openAccordion = openAccordion?.dataset.mapEditorAccordion ?? null;
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

    if (leftRail) {
      leftRail.scrollTop = this.mapEditorUi.leftRailScrollTop ?? 0;
    }

    if (rightRail) {
      rightRail.scrollTop = this.mapEditorUi.rightRailScrollTop ?? 0;
    }

    if (unitsGrid) {
      unitsGrid.scrollTop = this.mapEditorUi.unitsScrollTop ?? 0;
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
    const tableShell = this.root.querySelector('[data-role="run-loadout-table-shell"]');

    if (!tableShell) {
      return;
    }

    this.runLoadoutTableScroll = {
      top: tableShell.scrollTop,
      left: tableShell.scrollLeft
    };
  },

  applyRunLoadoutTableScroll() {
    const tableShell = this.root.querySelector('[data-role="run-loadout-table-shell"]');

    if (!tableShell) {
      return;
    }

    tableShell.scrollTop = this.runLoadoutTableScroll.top ?? 0;
    tableShell.scrollLeft = this.runLoadoutTableScroll.left ?? 0;
  }
};
