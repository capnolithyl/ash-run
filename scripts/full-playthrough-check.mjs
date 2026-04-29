import assert from 'node:assert/strict';
import { GameController } from '../src/game/app/GameController.js';
import { SLOT_IDS, TURN_SIDES } from '../src/game/core/constants.js';

class MemoryStorage {
  constructor() {
    this.meta = {
      version: 1,
      unlockedCommanderIds: ['atlas', 'viper', 'rook'],
      options: {
        animationSpeed: 'normal',
        enemyMoveSpeed: 'normal',
        showGrid: true,
        showCoordinates: false,
        autoEndTurnPrompt: true
      },
      totalRunsStarted: 0,
      totalRunsCleared: 0,
      lastPlayedSlotId: SLOT_IDS[0]
    };
    this.slots = new Map();
  }

  async loadMeta() { return structuredClone(this.meta); }
  async saveMeta(nextMeta) { this.meta = structuredClone(nextMeta); }
  async listSlots() {
    return SLOT_IDS.map((slotId) => {
      const record = this.slots.get(slotId);
      return {
        slotId,
        exists: Boolean(record),
        summary: record?.summary ?? null,
        updatedAt: record?.updatedAt ?? null
      };
    });
  }
  async loadSlot(slotId) {
    const record = this.slots.get(slotId);
    return record ? structuredClone(record) : null;
  }
  async saveSlot(slotId, record) { this.slots.set(slotId, structuredClone(record)); }
  async deleteSlot(slotId) { this.slots.delete(slotId); }
  async quit() {}
}

function forceBattleWinner(controller, winner) {
  const state = controller.battleSystem.state;
  if (winner === TURN_SIDES.PLAYER) {
    state.enemy.units = [];
  } else {
    state.player.units = [];
  }
  controller.battleSystem.updateVictoryState();
}

async function startConfiguredRun(controller) {
  controller.openNewRun();
  controller.openRunLoadout();
  controller.addRunLoadoutUnit('grunt');
  await controller.startNewRun();
  const state = controller.getState();
  assert.equal(state.screen, 'battle');
  assert.ok(controller.battleSystem, 'battle system should exist after starting a configured run');
}

async function runFullClearScenario() {
  const storage = new MemoryStorage();
  const controller = new GameController(storage);
  await controller.initialize();
  await startConfiguredRun(controller);

  let battlesCleared = 0;

  while (controller.getState().runStatus !== 'complete') {
    const loopState = controller.getState();
    if (loopState.runStatus === 'reward') {
      const reward = loopState.runState?.pendingRewardChoices?.[0];
      assert.ok(reward, 'reward state should expose at least one reward choice');
      await controller.selectRunReward(reward.id);
      continue;
    }

    assert.equal(loopState.screen, 'battle');
    assert.ok(controller.battleSystem, 'battle system should exist while run is active');

    forceBattleWinner(controller, TURN_SIDES.PLAYER);
    await controller.advanceRun();
    battlesCleared += 1;

    const updated = controller.getState();
    if (updated.runStatus === 'failed') {
      throw new Error('run unexpectedly failed during forced clear scenario');
    }

    if (battlesCleared > 20) {
      throw new Error('playthrough exceeded expected battle count');
    }
  }

  const completeState = controller.getState();
  assert.equal(completeState.runStatus, 'complete');
  assert.equal(completeState.runState.mapIndex, completeState.runState.targetMapCount);
  assert.equal(storage.slots.size, 0, 'completed run should delete in-progress slot save');

  return {
    battlesCleared,
    unlockedCommanders: completeState.metaState.unlockedCommanderIds.length
  };
}

async function runDefeatScenario() {
  const storage = new MemoryStorage();
  const controller = new GameController(storage);
  await controller.initialize();
  await startConfiguredRun(controller);

  forceBattleWinner(controller, TURN_SIDES.ENEMY);
  await controller.persistCurrentRun();

  const failed = controller.getState();
  assert.equal(failed.runStatus, 'failed');

  return {
    slotCount: storage.slots.size,
    runStatus: failed.runStatus
  };
}

async function runBattleTurnSmoke() {
  const storage = new MemoryStorage();
  const controller = new GameController(storage);
  await controller.initialize();
  await startConfiguredRun(controller);

  for (let i = 0; i < 3; i += 1) {
    await controller.endTurn();
    const state = controller.getState();
    assert.equal(state.screen, 'battle');
    assert.ok(state.battleSnapshot, 'battle snapshot should remain available after endTurn');
    if (state.runStatus === 'failed') {
      break;
    }
  }

  return {
    turnNumber: controller.getState().battleSnapshot.turn.number,
    runStatus: controller.getState().runStatus
  };
}

const clearResult = await runFullClearScenario();
const defeatResult = await runDefeatScenario();
const smokeResult = await runBattleTurnSmoke();

console.log('Full playthrough clear scenario passed:', clearResult);
console.log('Defeat scenario passed:', defeatResult);
console.log('Battle turn smoke scenario passed:', smokeResult);
