import test from "node:test";
import assert from "node:assert/strict";
import {
  TUTORIAL_LESSONS,
  createTutorialLessonBattleState,
  evaluateTutorialObjective,
  validateTutorialCurriculum
} from "../src/game/content/tutorialCurriculum.js";
import { BATTLE_MODES, TURN_SIDES } from "../src/game/core/constants.js";

test("tutorial curriculum contains six ordered valid lessons", () => {
  assert.equal(TUTORIAL_LESSONS.length, 6);
  assert.deepEqual(TUTORIAL_LESSONS.map((lesson) => lesson.order), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(validateTutorialCurriculum(), []);
  assert.ok(TUTORIAL_LESSONS.every((lesson) => lesson.steps.length >= 5));
});

test("building lesson teaches the required turn boundary before Supply", () => {
  const lesson = TUTORIAL_LESSONS.find(({ id }) => id === "buildings-capture-supply");
  const captureIndex = lesson.steps.findIndex(({ id }) => id === "building-capture-sector");
  const sequence = lesson.steps.slice(captureIndex, captureIndex + 5);

  assert.deepEqual(sequence.map(({ id }) => id), [
    "building-capture-sector",
    "building-end-turn-for-supply",
    "building-select-sector-for-supply",
    "building-hold-sector-for-supply",
    "building-resupply-sector"
  ]);
  assert.deepEqual(sequence.map(({ expectedAction }) => expectedAction.type), [
    "button",
    "endTurn",
    "selectUnit",
    "holdUnit",
    "button"
  ]);
  assert.equal(sequence.at(-1).expectedAction.action, "use-supply");
});

test("every lesson creates a real isolated tutorial battle", () => {
  for (const lesson of TUTORIAL_LESSONS) {
    const state = createTutorialLessonBattleState(lesson.id, lesson.steps[0].scenarioId);
    assert.equal(state.mode, BATTLE_MODES.TUTORIAL, lesson.id);
    assert.ok(state.map?.goal?.type, lesson.id);
    assert.ok(state.player?.units?.length > 0, lesson.id);
    assert.equal(state.rewardLedger, undefined, lesson.id);
    assert.equal(state.runId, undefined, lesson.id);
  }
});

test("mission lesson exposes all five real mission scenario types", () => {
  const scenarioTypes = ["rout", "hq", "rescue-pickup", "defend", "survive"].map(
    (scenarioId) => createTutorialLessonBattleState("mission-objectives", scenarioId).mission.type
  );
  assert.deepEqual(scenarioTypes, ["rout", "hq-capture", "rescue", "defend", "survive"]);
});

test("mission objectives retain their resolved battle for an explicit result step", () => {
  const lesson = TUTORIAL_LESSONS.find(({ id }) => id === "mission-objectives");
  const resultSteps = lesson.steps.filter(({ stageResult }) => stageResult?.kind === "victory");

  assert.deepEqual(resultSteps.map(({ stageResult }) => stageResult.objective), [
    "Rout",
    "HQ Capture",
    "Rescue",
    "Defend",
    "Survive"
  ]);
  assert.ok(resultSteps.every(({ scenarioId }) => scenarioId === undefined));
  assert.ok(resultSteps.every(({ expectedAction }) => expectedAction.type === "continue"));
  assert.equal(resultSteps.at(-1).completesLesson, true);
  assert.ok(lesson.steps.some(({ id }) => id === "mission-rescue-pickup-complete"));
});

test("objective predicates follow authoritative scenario state", () => {
  const buildings = createTutorialLessonBattleState("buildings-capture-supply");
  assert.equal(buildings.map.buildings.find((building) => building.id === "tutorial-neutral-hospital").owner, TURN_SIDES.PLAYER);
  const supplied = { predicate: "unit-supplied", unitId: "buildings-capper", resourceFloor: { hp: 55, ammo: 2, stamina: 20 } };
  assert.equal(evaluateTutorialObjective(buildings, supplied), false);
  buildings.player.units.find((unit) => unit.id === "buildings-capper").current.ammo += 1;
  assert.equal(evaluateTutorialObjective(buildings, supplied), true);

  const hq = createTutorialLessonBattleState("mission-objectives", "hq");
  assert.equal(evaluateTutorialObjective(hq, { predicate: "enemy-hq-captured" }), false);
  hq.map.buildings.find((building) => building.id.includes("enemy-command")).owner = TURN_SIDES.PLAYER;
  assert.equal(evaluateTutorialObjective(hq, { predicate: "enemy-hq-captured" }), true);

  const rescue = createTutorialLessonBattleState("mission-objectives", "rescue-dropoff");
  assert.equal(evaluateTutorialObjective(rescue, { predicate: "hostage-picked-up" }), true);
  rescue.mission.rescue.status = "delivered";
  assert.equal(evaluateTutorialObjective(rescue, { predicate: "rescue-complete" }), true);

  const rout = createTutorialLessonBattleState("mission-objectives", "rout");
  assert.equal(evaluateTutorialObjective(rout, { predicate: "rout-complete" }), false);
  rout.enemy.units[0].current.hp = 0;
  assert.equal(evaluateTutorialObjective(rout, { predicate: "rout-complete" }), true);
});
