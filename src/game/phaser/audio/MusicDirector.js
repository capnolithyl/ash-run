import { SCREEN_IDS, TURN_SIDES } from "../../core/constants.js";
import { MUSIC_TRACK_IDS, getMusicTrackKey } from "../assets.js";

const MUSIC_FADE_MS = 650;
const MUSIC_DUCK_FADE_MS = 120;

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
    this.categoryVolume = 1;
    this.duckFactor = 1;

    this.handleUnlocked = () => {
      this.sync(this.latestState);
    };
    this.scene.sound?.once?.("unlocked", this.handleUnlocked);
  }

  sync(state) {
    this.latestState = state;

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

  setCategoryVolume(volume) {
    const normalizedVolume = Number.isFinite(Number(volume))
      ? Math.max(0, Math.min(1, Number(volume)))
      : 1;

    if (this.categoryVolume === normalizedVolume) {
      return;
    }

    this.categoryVolume = normalizedVolume;
    this.refreshCurrentVolume();
  }

  setDuckFactor(factor, { immediate = false } = {}) {
    const normalizedFactor = Number.isFinite(Number(factor))
      ? Math.max(0, Math.min(1, Number(factor)))
      : 1;

    if (this.duckFactor === normalizedFactor) {
      return;
    }

    this.duckFactor = normalizedFactor;
    this.refreshCurrentVolume(immediate ? 0 : MUSIC_DUCK_FADE_MS);
  }

  getTargetVolume() {
    return this.categoryVolume * this.duckFactor;
  }

  refreshCurrentVolume(duration = MUSIC_DUCK_FADE_MS) {
    if (!this.currentSound) {
      return;
    }

    this.fadeSound(this.currentSound, this.getTargetVolume(), null, duration);
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
      this.fadeSound(nextSound, this.getTargetVolume());
      return;
    }

    this.currentSound = nextSound;
    this.currentKey = nextKey;
    this.ensurePlaying(nextSound);
    nextSound.setVolume(0);
    this.fadeSound(nextSound, this.getTargetVolume());

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

  fadeSound(sound, volume, onComplete = null, duration = MUSIC_FADE_MS) {
    this.scene.tweens.killTweensOf(sound);

    if (duration <= 0) {
      sound.setVolume(volume);
      onComplete?.();
      return;
    }

    this.scene.tweens.add({
      targets: sound,
      volume,
      duration,
      ease: "Sine.easeInOut",
      onComplete
    });
  }

  destroy() {
    this.scene.sound?.off?.("unlocked", this.handleUnlocked);
    for (const sound of this.sounds.values()) {
      this.scene.tweens?.killTweensOf?.(sound);
      sound.stop?.();
      sound.destroy?.();
    }

    this.sounds.clear();
    this.currentSound = null;
    this.currentKey = null;
    this.targetKey = null;
  }
}
