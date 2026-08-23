import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AUDIO_OPTIONS,
  GameAudioDirector,
  getEffectiveAudioGains,
  normalizeAudioOptions,
  requestImmediateAudioUnlock,
} from "../src/game/phaser/audio/GameAudioDirector.js";
import {
  getConservativePan,
  getDeterministicPlaybackRate,
} from "../src/game/phaser/audio/SoundEffectsDirector.js";
import { SFX_CUE_IDS, getSfxCueDefinition } from "../src/game/phaser/audio/SfxCatalog.js";

class FakeEmitter {
  constructor() {
    this.handlers = new Map();
  }

  on(event, handler) {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push({ handler, once: false });
    this.handlers.set(event, handlers);
  }

  once(event, handler) {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push({ handler, once: true });
    this.handlers.set(event, handlers);
  }

  off(event, handler) {
    this.handlers.set(event, (this.handlers.get(event) ?? []).filter((item) => item.handler !== handler));
  }

  emit(event, ...args) {
    const handlers = [...(this.handlers.get(event) ?? [])];
    this.handlers.set(event, handlers.filter((item) => !item.once));
    for (const { handler } of handlers) {
      handler(...args);
    }
  }
}

class FakeSound extends FakeEmitter {
  constructor(key) {
    super();
    this.key = key;
    this.isPlaying = false;
    this.isPaused = false;
    this.volume = 0;
    this.destroyed = false;
  }

  play(config = {}) {
    this.playConfig = config;
    this.volume = config.volume ?? this.volume;
    this.isPlaying = true;
    return true;
  }

  setVolume(volume) {
    this.volume = volume;
    return this;
  }

  stop() {
    this.isPlaying = false;
  }

  destroy() {
    this.destroyed = true;
    this.emit("destroy");
  }
}

function createFakeScene() {
  const emitter = new FakeEmitter();
  const sounds = [];
  const timers = [];
  const sound = {
    ...emitter,
    handlers: emitter.handlers,
    locked: false,
    volume: 1,
    mute: false,
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
    setVolume(volume) { this.volume = volume; },
    setMute(mute) { this.mute = mute; },
    add(key) {
      const created = new FakeSound(key);
      sounds.push(created);
      return created;
    },
    unlock() {},
  };

  return {
    sound,
    sounds,
    cache: { audio: { exists: () => true } },
    time: {
      now: 1000,
      delayedCall(delay, callback) {
        const timer = { delay, callback, removed: false, remove() { this.removed = true; } };
        timers.push(timer);
        return timer;
      },
    },
    timers,
    tweens: {
      killTweensOf() {},
      add(config) {
        config.targets.volume = config.volume;
        config.onComplete?.();
        return config;
      },
    },
  };
}

test("audio option normalization and effective category gains are bounded", () => {
  assert.deepEqual(DEFAULT_AUDIO_OPTIONS, {
    masterVolume: 0.45,
    musicVolume: 0.6,
    sfxVolume: 0.45,
    muted: false,
  });
  assert.deepEqual(normalizeAudioOptions({}), DEFAULT_AUDIO_OPTIONS);
  assert.deepEqual(normalizeAudioOptions({
    masterVolume: 2,
    musicVolume: -1,
    sfxVolume: "0.25",
    muted: true,
  }), {
    masterVolume: 1,
    musicVolume: 0,
    sfxVolume: 0.25,
    muted: true,
  });
  assert.deepEqual(getEffectiveAudioGains({
    masterVolume: 0.4,
    musicVolume: 0.5,
    sfxVolume: 0.85,
  }), {
    master: 0.4,
    music: 0.2,
    sfx: 0.34,
  });
  assert.deepEqual(getEffectiveAudioGains({ muted: true }), { master: 0, music: 0, sfx: 0 });
});

test("pitch variation is deterministic and battlefield pan is conservative", () => {
  const cue = getSfxCueDefinition(SFX_CUE_IDS.WEAPON_RIFLE);
  const context = { eventId: 42, source: "grunt-a" };
  assert.equal(getDeterministicPlaybackRate(cue, context), getDeterministicPlaybackRate(cue, context));
  assert.notEqual(getDeterministicPlaybackRate(cue, context), getDeterministicPlaybackRate(cue, { eventId: 43 }));
  assert.equal(getConservativePan(-2), -0.35);
  assert.equal(getConservativePan(0.2), 0.2);
  assert.equal(getConservativePan(2), 0.35);
  assert.equal(getConservativePan(undefined), 0);
});

test("locked Web Audio is resumed immediately when the host autoplay policy allows it", async () => {
  const scene = createFakeScene();
  let resumeCalls = 0;
  scene.sound.locked = true;
  scene.sound.context = {
    state: "suspended",
    async resume() {
      resumeCalls += 1;
      this.state = "running";
    },
  };

  assert.equal(requestImmediateAudioUnlock(scene.sound), true);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(resumeCalls, 1);
  assert.equal(scene.sound.unlocked, true);
});

test("immediate Web Audio resume leaves the interaction fallback intact when blocked", async () => {
  const scene = createFakeScene();
  scene.sound.locked = true;
  scene.sound.context = {
    state: "suspended",
    resume() {
      return Promise.reject(new Error("User gesture required"));
    },
  };

  assert.equal(requestImmediateAudioUnlock(scene.sound), true);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(scene.sound.locked, true);
  assert.notEqual(scene.sound.unlocked, true);
});

test("GameAudioDirector applies live mixer options and plays catalogued cues", () => {
  const scene = createFakeScene();
  const director = new GameAudioDirector(scene);
  director.sync({
    screen: "title",
    metaState: { options: { masterVolume: 0.55, musicVolume: 0.6, sfxVolume: 0.25, muted: true } },
  });

  assert.equal(scene.sound.volume, 0.55);
  assert.equal(scene.sound.mute, true);
  assert.equal(director.musicDirector.categoryVolume, 0.6);
  assert.equal(director.sfxDirector.categoryVolume, 0.25);

  scene.sound.mute = false;
  const played = director.playCue(SFX_CUE_IDS.UI_CONFIRM, { eventId: 7, pan: 0.8 });
  const cue = getSfxCueDefinition(SFX_CUE_IDS.UI_CONFIRM);
  assert.ok(played);
  assert.equal(played.playConfig.volume, cue.gain * 0.25);
  assert.equal(played.playConfig.pan, 0.35);
  director.destroy();
  assert.ok(played.destroyed);
});

test("commander music follows the active side and stops for commanders without themes", () => {
  const scene = createFakeScene();
  const director = new GameAudioDirector(scene);

  director.sync({
    screen: "battle",
    metaState: { options: {} },
    battleSnapshot: {
      player: { commanderId: "rook" },
      enemy: { commanderId: "nova" },
      turn: { activeSide: "player" },
    },
  });
  assert.equal(director.musicDirector.currentKey, "music:commander:rook");
  assert.equal(director.musicDirector.currentSound.playConfig.loop, true);

  const rookSound = director.musicDirector.currentSound;
  director.sync({
    screen: "battle",
    metaState: { options: {} },
    battleSnapshot: {
      player: { commanderId: "rook" },
      enemy: { commanderId: "atlas" },
      turn: { activeSide: "enemy" },
    },
  });
  assert.equal(director.musicDirector.currentKey, null);
  assert.equal(director.musicDirector.currentSound, null);
  assert.equal(rookSound.isPlaying, false);

  director.sync({
    screen: "battle",
    metaState: { options: {} },
    battleSnapshot: {
      player: { commanderId: "rook" },
      enemy: { commanderId: "nova" },
      turn: { activeSide: "enemy" },
    },
  });
  assert.equal(director.musicDirector.currentKey, "music:commander:nova");
  assert.equal(director.musicDirector.currentSound.playConfig.loop, true);

  director.destroy();
});

test("SFX playback enforces event deduplication, cooldowns, and bounded polyphony", () => {
  const scene = createFakeScene();
  const director = new GameAudioDirector(scene);
  director.sync({ screen: "title", metaState: { options: {} } });

  const first = director.playCue(SFX_CUE_IDS.UI_CONFIRM, { eventId: 9 });
  assert.ok(first);
  assert.equal(director.playCue(SFX_CUE_IDS.UI_CONFIRM, { eventId: 9 }), null);
  assert.equal(director.playCue(SFX_CUE_IDS.UI_CONFIRM, { eventId: 10 }), null);

  scene.time.now += 1000;
  const next = director.playCue(SFX_CUE_IDS.UI_CONFIRM, { eventId: 10 });
  assert.ok(next);
  assert.equal(director.playCue(SFX_CUE_IDS.UI_CONFIRM, { eventId: 9 }), null);

  scene.time.now += 1000;
  assert.ok(director.playCue(SFX_CUE_IDS.UI_HOVER, { dedupeKey: "stable-control" }));
  scene.time.now += 150;
  assert.ok(director.playCue(SFX_CUE_IDS.UI_HOVER, { dedupeKey: "stable-control" }));

  const cueId = SFX_CUE_IDS.IMPACT_HIT;
  const cue = getSfxCueDefinition(cueId);
  for (let index = 0; index < cue.maxVoices + 2; index += 1) {
    scene.time.now += 1000;
    director.playCue(cueId, { eventId: `impact-${index}` });
  }
  assert.equal(director.sfxDirector.voices.get(cueId).length, cue.maxVoices);
  director.destroy();
});

test("a movement loop can restart under the same key while its previous voice fades", () => {
  const scene = createFakeScene();
  let pendingFade = null;
  scene.tweens.add = (config) => {
    pendingFade = config;
    return config;
  };
  const director = new GameAudioDirector(scene);
  director.sync({ screen: "battle", metaState: { options: {} } });

  const first = director.startLoop(SFX_CUE_IDS.MOVE_INFANTRY, {
    loopKey: "movement:battle-1:grunt-1"
  });
  assert.ok(first);
  assert.equal(director.stopLoop("movement:battle-1:grunt-1"), true);

  const restarted = director.startLoop(SFX_CUE_IDS.MOVE_INFANTRY, {
    loopKey: "movement:battle-1:grunt-1"
  });
  assert.ok(restarted);
  assert.notEqual(restarted, first);
  assert.equal(
    director.sfxDirector.loops.get("movement:battle-1:grunt-1"),
    restarted
  );

  pendingFade.onComplete();
  assert.equal(first.destroyed, true);
  assert.equal(
    director.sfxDirector.loops.get("movement:battle-1:grunt-1"),
    restarted
  );
  director.destroy();
});

test("locked audio ignores hover but retains one confirm and outcome cues duck music", () => {
  const scene = createFakeScene();
  scene.sound.locked = true;
  const director = new GameAudioDirector(scene);

  assert.equal(director.playCue(SFX_CUE_IDS.UI_HOVER, { userInitiated: true }), null);
  assert.equal(director.pendingUnlockCue, null);
  assert.equal(director.playCue(SFX_CUE_IDS.UI_CONFIRM, { userInitiated: true }), null);
  assert.equal(director.pendingUnlockCue.cueId, SFX_CUE_IDS.UI_CONFIRM);

  scene.sound.locked = false;
  scene.sound.emit("unlocked");
  assert.ok(scene.sounds.some((sound) => sound.key === getSfxCueDefinition(SFX_CUE_IDS.UI_CONFIRM).key));

  scene.time.now += 1000;
  director.playCue(SFX_CUE_IDS.VICTORY, { eventId: "victory" });
  assert.equal(director.musicDirector.duckFactor, 0.7);
  const longDuckDelay = scene.timers.at(-1).delay;
  assert.ok(longDuckDelay > getSfxCueDefinition(SFX_CUE_IDS.VICTORY).durationMs);
  director.playCue(SFX_CUE_IDS.COMMANDER_ATLAS, { eventId: "atlas" });
  assert.equal(scene.timers.at(-1).delay, longDuckDelay);
  scene.timers.at(-1).callback();
  assert.equal(director.musicDirector.duckFactor, 1);
  director.destroy();
});

test("synchronous browser unlock neither replays confirm twice nor lets a locked hover through", () => {
  const hoverScene = createFakeScene();
  hoverScene.sound.locked = true;
  hoverScene.sound.unlock = function unlock() {
    this.locked = false;
    this.emit("unlocked");
  };
  const hoverDirector = new GameAudioDirector(hoverScene);
  hoverDirector.playCue(SFX_CUE_IDS.UI_HOVER, { source: "pointer" });
  assert.equal(
    hoverScene.sounds.filter((sound) => sound.key === getSfxCueDefinition(SFX_CUE_IDS.UI_HOVER).key).length,
    0,
  );
  hoverDirector.destroy();

  const confirmScene = createFakeScene();
  confirmScene.sound.locked = true;
  confirmScene.sound.unlock = function unlock() {
    this.locked = false;
    this.emit("unlocked");
  };
  const confirmDirector = new GameAudioDirector(confirmScene);
  confirmDirector.playCue(SFX_CUE_IDS.UI_CONFIRM, { source: "click" });
  assert.equal(
    confirmScene.sounds.filter((sound) => sound.key === getSfxCueDefinition(SFX_CUE_IDS.UI_CONFIRM).key).length,
    1,
  );
  confirmDirector.destroy();
});
