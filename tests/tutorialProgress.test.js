import test from "node:test";
import assert from "node:assert/strict";
import {
  completeTutorialLesson,
  createDefaultTutorialProgress,
  normalizeTutorialProgress,
  TUTORIAL_PROGRESS_MIGRATIONS
} from "../src/game/state/tutorialProgress.js";
import { TUTORIAL_LESSON_ORDER } from "../src/game/content/tutorialConstants.js";

test("new tutorial progress unlocks only Basic Orders", () => {
  const progress = createDefaultTutorialProgress();
  assert.equal(progress.promptSeen, false);
  assert.deepEqual(progress.completedLessonIds, []);
  assert.deepEqual(progress.unlockedLessonIds, ["basic-orders"]);
});

test("legacy profiles skip the fresh-profile prompt", () => {
  assert.equal(normalizeTutorialProgress(null, { legacyProfile: true }).promptSeen, true);
  assert.equal(normalizeTutorialProgress(null, { legacyProfile: false }).promptSeen, false);
});

test("curriculum migrations are explicit and normalize version-zero progress", () => {
  assert.equal(typeof TUTORIAL_PROGRESS_MIGRATIONS[0], "function");
  const migrated = normalizeTutorialProgress({
    promptSeen: true,
    completedLessonIds: ["basic-orders"],
    unlockedLessonIds: ["basic-orders"]
  });
  assert.equal(migrated.curriculumVersion, 1);
  assert.deepEqual(migrated.unlockedLessonIds, TUTORIAL_LESSON_ORDER.slice(0, 2));
});

test("completion unlocks the next lesson and remains replayable", () => {
  const once = completeTutorialLesson(createDefaultTutorialProgress(), "basic-orders");
  const replay = completeTutorialLesson(once, "basic-orders");
  assert.deepEqual(replay.completedLessonIds, ["basic-orders"]);
  assert.deepEqual(replay.unlockedLessonIds, TUTORIAL_LESSON_ORDER.slice(0, 2));
});

test("normalization filters unknown ids and repairs completed/unlocked relationships", () => {
  const progress = normalizeTutorialProgress({
    promptSeen: true,
    curriculumVersion: 99,
    completedLessonIds: ["combat-roles-terrain", "removed-lesson"],
    unlockedLessonIds: ["removed-lesson"]
  });
  assert.deepEqual(progress.completedLessonIds, ["combat-roles-terrain"]);
  assert.deepEqual(progress.unlockedLessonIds, [
    "basic-orders",
    "combat-roles-terrain",
    "support-transport"
  ]);
});

test("locked lessons cannot be completed out of sequence", () => {
  const progress = completeTutorialLesson(createDefaultTutorialProgress(), "mission-objectives");
  assert.deepEqual(progress.completedLessonIds, []);
  assert.deepEqual(progress.unlockedLessonIds, ["basic-orders"]);
});
