import {
  TUTORIAL_CURRICULUM_VERSION,
  TUTORIAL_LESSON_ORDER
} from "../content/tutorialConstants.js";

function uniqueKnownIds(ids) {
  const knownIds = new Set(TUTORIAL_LESSON_ORDER);
  return [...new Set(Array.isArray(ids) ? ids : [])].filter((id) => knownIds.has(id));
}

export const TUTORIAL_PROGRESS_MIGRATIONS = Object.freeze({
  0: (progress) => ({
    ...progress,
    curriculumVersion: 1,
    completedLessonIds: Array.isArray(progress.completedLessonIds) ? progress.completedLessonIds : [],
    unlockedLessonIds: Array.isArray(progress.unlockedLessonIds) ? progress.unlockedLessonIds : []
  })
});

function applyTutorialProgressMigrations(progress) {
  let migrated = { ...progress };
  let version = Number.isInteger(migrated.curriculumVersion)
    ? migrated.curriculumVersion
    : 0;

  while (version < TUTORIAL_CURRICULUM_VERSION) {
    const migrate = TUTORIAL_PROGRESS_MIGRATIONS[version];
    if (!migrate) break;
    migrated = migrate(migrated);
    version = migrated.curriculumVersion;
  }

  return migrated;
}

export function createDefaultTutorialProgress() {
  return {
    promptSeen: false,
    curriculumVersion: TUTORIAL_CURRICULUM_VERSION,
    completedLessonIds: [],
    unlockedLessonIds: [TUTORIAL_LESSON_ORDER[0]]
  };
}

export function normalizeTutorialProgress(progress, { legacyProfile = false } = {}) {
  const defaults = createDefaultTutorialProgress();

  if (!progress || typeof progress !== "object") {
    return {
      ...defaults,
      promptSeen: legacyProfile
    };
  }

  const migrated = applyTutorialProgressMigrations(progress);
  const completedLessonIds = uniqueKnownIds(migrated.completedLessonIds);
  const unlocked = new Set([
    TUTORIAL_LESSON_ORDER[0],
    ...uniqueKnownIds(migrated.unlockedLessonIds),
    ...completedLessonIds
  ]);

  for (const completedId of completedLessonIds) {
    const index = TUTORIAL_LESSON_ORDER.indexOf(completedId);
    const nextId = TUTORIAL_LESSON_ORDER[index + 1];

    if (nextId) {
      unlocked.add(nextId);
    }
  }

  return {
    promptSeen: migrated.promptSeen === true,
    curriculumVersion: TUTORIAL_CURRICULUM_VERSION,
    completedLessonIds: TUTORIAL_LESSON_ORDER.filter((id) => completedLessonIds.includes(id)),
    unlockedLessonIds: TUTORIAL_LESSON_ORDER.filter((id) => unlocked.has(id))
  };
}

export function completeTutorialLesson(progress, lessonId) {
  const normalized = normalizeTutorialProgress(progress);

  if (!normalized.unlockedLessonIds.includes(lessonId)) {
    return normalized;
  }

  return normalizeTutorialProgress({
    ...normalized,
    completedLessonIds: [...normalized.completedLessonIds, lessonId]
  });
}

export function isTutorialLessonUnlocked(progress, lessonId) {
  return normalizeTutorialProgress(progress).unlockedLessonIds.includes(lessonId);
}
