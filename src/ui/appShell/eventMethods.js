import { SCREEN_IDS } from "../../game/core/constants.js";
import { DEBUG_SPAWN_STAT_DATASETS, delay } from "./shared.js";

export const appShellEventMethods = {
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

  async handleClick(event) {
    const trigger = event.target.closest("[data-action]");

    if (!trigger || !this.latestState) {
      return;
    }

    const { action, commanderId, slotId, unitTypeId } = trigger.dataset;

    switch (action) {
      case "open-new-run":
        this.controller.openNewRun();
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
      case "open-options":
        this.controller.openOptions();
        break;
      case "open-progression":
        this.controller.openProgression();
        break;
      case "open-run-loadout":
        this.controller.openRunLoadout();
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
        if (
          this.commanderSliderSuppressClick &&
          trigger.closest('[data-role="commander-slider"]')
        ) {
          this.commanderSliderSuppressClick = false;
          event.preventDefault();
          return;
        }
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
        if (
          this.commanderSliderSuppressClick &&
          trigger.closest('[data-role="commander-slider"]')
        ) {
          this.commanderSliderSuppressClick = false;
          event.preventDefault();
          return;
        }
        if (trigger.getAttribute("aria-disabled") === "true") {
          return;
        }
        this.controller.updateSkirmishSetup({ playerCommanderId: commanderId });
        break;
      case "select-skirmish-enemy-commander":
        if (
          this.commanderSliderSuppressClick &&
          trigger.closest('[data-role="commander-slider"]')
        ) {
          this.commanderSliderSuppressClick = false;
          event.preventDefault();
          return;
        }
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
      case "cancel-support-choice":
      case "cancel-unload-choice":
        await this.controller.handleBattleContextAction();
        break;
      case "capture-building":
        await this.controller.captureWithSelectedUnit();
        break;
      case "use-support":
        await this.controller.useSelectedSupportAbility();
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
      case "debug-spawn-unit":
        await this.controller.debugSpawnUnit({
          owner: this.getDebugField("spawn-owner", "player"),
          unitTypeId: this.getDebugField("spawn-unit-type", "grunt"),
          x: this.getDebugNumberField("spawn-x", 0),
          y: this.getDebugNumberField("spawn-y", 0),
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
          experience: this.getDebugNumberField("unit-experience", NaN)
        });
        break;
      case "debug-apply-commanders":
        await this.controller.debugSetCommanders({
          playerCommanderId: this.getDebugField("player-commander", "atlas"),
          enemyCommanderId: this.getDebugField("enemy-commander", "viper")
        });
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
      default:
        break;
    }
  },

  async handleChange(event) {
    const skirmishField = event.target.dataset.skirmishField;

    if (skirmishField) {
      await this.controller.updateSkirmishSetup({
        [skirmishField]: Number(event.target.value)
      });
      return;
    }

    if (event.target.dataset.debugField === "spawn-unit-type") {
      this.syncDebugSpawnStatFields();
      return;
    }

    const optionKey = event.target.dataset.option;

    if (!optionKey) {
      return;
    }

    const nextValue =
      event.target.type === "checkbox" ? event.target.checked : Number(event.target.value);

    await this.controller.updateOptions({
      [optionKey]: nextValue
    });
  },

  handleInput(event) {
    const skirmishField = event.target.dataset.skirmishField;

    if (!skirmishField) {
      return;
    }

    const output = this.root.querySelector(`[data-skirmish-output="${skirmishField}"]`);

    if (output) {
      output.textContent = event.target.value;
    }
  }
};
