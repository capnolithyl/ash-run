import { SCREEN_IDS, TURN_SIDES } from "../../core/constants.js";
import { MUSIC_TRACK_IDS, getMusicTrackKey } from "../assets.js";

const DEFAULT_MASTER_VOLUME = 0.4;
const MUSIC_FADE_MS = 650;

function clampVolume(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_MASTER_VOLUME;
  }

  return Math.max(0, Math.min(1, value));
}

function getEffectiveMasterVolume(options = {}) {
  return options.muted ? 0 : clampVolume(Number(options.masterVolume));
}

export function getMusicTrackIdForState(state) {
  if (state?.screen !== SCREEN_IDS.BATTLE || !state?.battleSnapshot) {
    return MUSIC_TRACK_IDS.MENU;
  }

  return state.battleSnapshot.turn.activeSide === TURN_SIDES.ENEMY
    ? MUSIC_TRACK_IDS.ENEMY_TURN
    : MUSIC_TRACK_IDS.ALLY_TURN;
}

export class MusicDirector {
  constructor(scene) {
    this.scene = scene;
    this.latestState = null;
    this.currentSound = null;
    this.currentKey = null;
    this.targetKey = null;
    this.sounds = new Map();

    this.scene.sound?.once?.("unlocked", () => {
      this.sync(this.latestState);
    });
  }

  sync(state) {
    this.latestState = state;
    this.applyMasterVolume(state?.metaState?.options);

    const nextTrackId = getMusicTrackIdForState(state);
    const nextKey = getMusicTrackKey(nextTrackId);

    if (!nextKey) {
      return;
    }

    const alreadyTargetingTrack = this.targetKey === nextKey;
    this.targetKey = nextKey;

    if (this.scene.sound?.locked) {
      return;
    }

    if (alreadyTargetingTrack && this.currentKey === nextKey && this.currentSound?.isPlaying) {
      return;
    }

    this.crossfadeTo(nextKey);
  }

  applyMasterVolume(options) {
    const volume = getEffectiveMasterVolume(options);

    if (typeof this.scene.sound?.setVolume === "function") {
      this.scene.sound.setVolume(volume);
      return;
    }

    if (this.scene.sound) {
      this.scene.sound.volume = volume;
    }
  }

  getOrCreateSound(key) {
    const cachedSound = this.sounds.get(key);

    if (cachedSound) {
      return cachedSound;
    }

    const sound = this.scene.sound.add(key, {
      loop: true,
      volume: 0
    });

    this.sounds.set(key, sound);
    return sound;
  }

  crossfadeTo(nextKey) {
    if (!this.scene.cache.audio.exists(nextKey)) {
      return;
    }

    const previousSound = this.currentSound;
    const nextSound = this.getOrCreateSound(nextKey);

    if (previousSound === nextSound) {
      this.ensurePlaying(nextSound);
      this.fadeSound(nextSound, 1);
      return;
    }

    this.currentSound = nextSound;
    this.currentKey = nextKey;
    this.ensurePlaying(nextSound);
    nextSound.setVolume(0);
    this.fadeSound(nextSound, 1);

    if (previousSound) {
      this.fadeSound(previousSound, 0, () => {
        previousSound.stop();
      });
    }
  }

  ensurePlaying(sound) {
    if (sound.isPlaying) {
      return;
    }

    sound.play({
      loop: true,
      volume: sound.volume ?? 0
    });
  }

  fadeSound(sound, volume, onComplete = null) {
    this.scene.tweens.killTweensOf(sound);
    this.scene.tweens.add({
      targets: sound,
      volume,
      duration: MUSIC_FADE_MS,
      ease: "Sine.easeInOut",
      onComplete
    });
  }
}
