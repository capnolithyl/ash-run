import { isBattleScreen } from "./screenState.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function bindBattleSceneGamepadControls(scene) {
  scene.input.gamepad?.on?.("connected", () => {
    scene.seedGamepadCursorFromState();
  });
}

export const battleSceneGamepadMethods = {
  update(time) {
    this.pollGamepadInput(time);
  },

  pollGamepadInput(time) {
    const gamepad = this.getPrimaryGamepad();

    if (!gamepad || !this.controller) {
      return;
    }

    if (!isBattleScreen(this.latestState)) {
      this.gamepadButtonState.clear();
      return;
    }

    if (this.shouldDeferGamepadToDom()) {
      this.syncGamepadButtonState(gamepad);
      this.gamepadMoveDirection = null;
      this.gamepadNextMoveAt = 0;
      return;
    }

    const pauseMenuOpen = this.latestState?.battleUi?.pauseMenuOpen === true;

    if (this.consumeGamepadButtonPress(gamepad, 9)) {
      if (pauseMenuOpen) {
        this.controller.closePauseMenu();
      } else {
        this.controller.openPauseMenu();
      }
      return;
    }

    if (pauseMenuOpen) {
      if (this.consumeGamepadButtonPress(gamepad, 1)) {
        this.controller.closePauseMenu();
      }
      return;
    }

    if (this.consumeGamepadButtonPress(gamepad, 5) || this.consumeGamepadButtonPress(gamepad, 4)) {
      this.runGamepadAction(() => this.controller.selectNextReadyUnit());
    }

    if (this.consumeGamepadButtonPress(gamepad, 1)) {
      this.runGamepadAction(() => this.controller.handleBattleContextAction());
    }

    if (this.consumeGamepadButtonPress(gamepad, 0)) {
      const tile = this.getGamepadCursorTile();

      if (tile) {
        this.runGamepadAction(() => this.controller.handleBattleTileClick(tile.x, tile.y));
      }
    }

    const moveDirection = this.getGamepadMoveDirection(gamepad);

    if (!moveDirection) {
      this.gamepadMoveDirection = null;
      this.gamepadNextMoveAt = 0;
      return;
    }

    const directionChanged =
      !this.gamepadMoveDirection ||
      this.gamepadMoveDirection.x !== moveDirection.x ||
      this.gamepadMoveDirection.y !== moveDirection.y;

    if (!directionChanged && time < this.gamepadNextMoveAt) {
      return;
    }

    this.moveGamepadCursor(moveDirection.x, moveDirection.y);
    this.gamepadMoveDirection = moveDirection;
    this.gamepadNextMoveAt = time + (directionChanged ? 220 : 110);
  },

  getPrimaryGamepad() {
    const gamepads = this.input.gamepad?.gamepads ?? [];
    return gamepads.find((gamepad) => gamepad?.connected) ?? null;
  },

  shouldDeferGamepadToDom() {
    if (typeof document === "undefined") {
      return false;
    }

    return Boolean(
      document.querySelector(
        "#ui-root[data-input-mode='controller'] .is-controller-focused, #ui-root[data-input-mode='controller'] .battle-command-prompt, #ui-root[data-input-mode='controller'] .battle-overlay"
      )
    );
  },

  consumeGamepadButtonPress(gamepad, buttonIndex) {
    const pressed = Boolean(gamepad?.buttons?.[buttonIndex]?.pressed);
    const previous = this.gamepadButtonState.get(buttonIndex) === true;
    this.gamepadButtonState.set(buttonIndex, pressed);
    return pressed && !previous;
  },

  syncGamepadButtonState(gamepad) {
    for (const buttonIndex of [0, 1, 4, 5, 9]) {
      this.gamepadButtonState.set(buttonIndex, Boolean(gamepad?.buttons?.[buttonIndex]?.pressed));
    }
  },

  getGamepadMoveDirection(gamepad) {
    const axisX = Number(gamepad?.axes?.[0]?.getValue?.() ?? 0);
    const axisY = Number(gamepad?.axes?.[1]?.getValue?.() ?? 0);
    const threshold = 0.5;
    const dpadLeft = Boolean(gamepad?.buttons?.[14]?.pressed);
    const dpadRight = Boolean(gamepad?.buttons?.[15]?.pressed);
    const dpadUp = Boolean(gamepad?.buttons?.[12]?.pressed);
    const dpadDown = Boolean(gamepad?.buttons?.[13]?.pressed);
    const horizontal = dpadLeft ? -1 : dpadRight ? 1 : axisX <= -threshold ? -1 : axisX >= threshold ? 1 : 0;
    const vertical = dpadUp ? -1 : dpadDown ? 1 : axisY <= -threshold ? -1 : axisY >= threshold ? 1 : 0;

    if (!horizontal && !vertical) {
      return null;
    }

    if (Math.abs(axisX) > Math.abs(axisY) && horizontal) {
      return { x: horizontal, y: 0 };
    }

    if (Math.abs(axisY) > Math.abs(axisX) && vertical) {
      return { x: 0, y: vertical };
    }

    if (horizontal) {
      return { x: horizontal, y: 0 };
    }

    return { x: 0, y: vertical };
  },

  seedGamepadCursorFromState() {
    if (!isBattleScreen(this.latestState)) {
      this.gamepadCursorTile = null;
      return;
    }

    const selectedTile = this.latestState.battleSnapshot?.presentation?.selectedTile;

    this.gamepadCursorTile = selectedTile
      ? { x: selectedTile.x, y: selectedTile.y }
      : this.gamepadCursorTile;
  },

  getGamepadCursorTile() {
    if (!isBattleScreen(this.latestState)) {
      return null;
    }

    const snapshot = this.latestState.battleSnapshot;

    if (!this.gamepadCursorTile) {
      this.seedGamepadCursorFromState();
    }

    if (!this.gamepadCursorTile) {
      this.gamepadCursorTile = { x: 0, y: 0 };
    }

    this.gamepadCursorTile = {
      x: clamp(this.gamepadCursorTile.x, 0, snapshot.map.width - 1),
      y: clamp(this.gamepadCursorTile.y, 0, snapshot.map.height - 1)
    };

    return this.gamepadCursorTile;
  },

  moveGamepadCursor(deltaX, deltaY) {
    const tile = this.getGamepadCursorTile();

    if (!tile) {
      return;
    }

    const snapshot = this.latestState.battleSnapshot;
    const nextTile = {
      x: clamp(tile.x + deltaX, 0, snapshot.map.width - 1),
      y: clamp(tile.y + deltaY, 0, snapshot.map.height - 1)
    };

    if (nextTile.x === tile.x && nextTile.y === tile.y) {
      return;
    }

    this.gamepadCursorTile = nextTile;
    this.hoveredTile = nextTile;

    if (this.controller.setBattleHoverTile) {
      this.controller.setBattleHoverTile(nextTile);
    } else {
      this.renderBattle();
    }
  },

  runGamepadAction(action) {
    if (this.gamepadActionBusy) {
      return;
    }

    this.gamepadActionBusy = true;
    Promise.resolve(action()).finally(() => {
      this.gamepadActionBusy = false;
    });
  }
};
