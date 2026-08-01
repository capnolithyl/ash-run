import { MusicDirector } from "./MusicDirector.js";
import { SoundEffectsDirector } from "./SoundEffectsDirector.js";
import { SFX_CUE_IDS } from "./SfxCatalog.js";

export const DEFAULT_AUDIO_OPTIONS = Object.freeze({
  masterVolume: 0.45,
  musicVolume: 0.6,
  sfxVolume: 0.45,
  muted: false,
});

const UNLOCK_RETAINED_CUES = new Set([
  SFX_CUE_IDS.UI_CONFIRM,
  SFX_CUE_IDS.UI_CANCEL,
]);

function clampVolume(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(0, Math.min(1, numericValue))
    : fallback;
}

export function normalizeAudioOptions(options = {}) {
  return {
    masterVolume: clampVolume(options.masterVolume, DEFAULT_AUDIO_OPTIONS.masterVolume),
    musicVolume: clampVolume(options.musicVolume, DEFAULT_AUDIO_OPTIONS.musicVolume),
    sfxVolume: clampVolume(options.sfxVolume, DEFAULT_AUDIO_OPTIONS.sfxVolume),
    muted: options.muted === true,
  };
}

export function getEffectiveAudioGains(options = {}) {
  const normalized = normalizeAudioOptions(options);
  const master = normalized.muted ? 0 : normalized.masterVolume;
  return {
    master,
    music: master * normalized.musicVolume,
    sfx: master * normalized.sfxVolume,
  };
}

export class GameAudioDirector {
  constructor(scene, controller = null, { logger = console } = {}) {
    this.scene = scene;
    this.controller = controller;
    this.logger = logger;
    this.latestState = null;
    this.pendingUnlockCue = null;
    this.duckRestoreTimer = null;
    this.duckRestoreAt = 0;
    this.destroyed = false;
    this.musicDirector = new MusicDirector(scene);
    this.sfxDirector = new SoundEffectsDirector(scene, {
      logger,
      onDuck: (durationMs) => this.duckMusic(durationMs),
    });

    this.handleUnlocked = () => {
      this.musicDirector.sync(this.latestState);
      const pendingCue = this.pendingUnlockCue;
      this.pendingUnlockCue = null;
      if (pendingCue) {
        this.sfxDirector.playCue(pendingCue.cueId, pendingCue.context);
      }
    };
    this.scene.sound?.on?.("unlocked", this.handleUnlocked);

    this.unsubscribeAudioCues = this.controller?.subscribeAudioCues?.((request) => {
      if (request?.cueId) {
        this.playCue(request.cueId, request);
      }
    }) ?? null;
    this.unsubscribeAudioOptions = this.controller?.subscribeAudioOptions?.((options) => {
      this.applyOptions(options);
    }) ?? null;
  }

  applyOptions(nextOptions) {
    const options = normalizeAudioOptions(nextOptions);
    const soundManager = this.scene.sound;

    if (typeof soundManager?.setVolume === "function") {
      soundManager.setVolume(options.masterVolume);
    } else if (soundManager) {
      soundManager.volume = options.masterVolume;
    }

    if (typeof soundManager?.setMute === "function") {
      soundManager.setMute(options.muted);
    } else if (soundManager) {
      soundManager.mute = options.muted;
    }

    this.musicDirector.setCategoryVolume(options.musicVolume);
    this.sfxDirector.setCategoryVolume(options.sfxVolume);
  }

  sync(state) {
    if (this.destroyed) {
      return;
    }

    this.latestState = state;
    this.applyOptions(state?.metaState?.options);
    this.musicDirector.sync(state);
  }

  playCue(cueId, context = {}) {
    if (this.destroyed) {
      return null;
    }

    if (this.scene.sound?.locked) {
      if (context.userInitiated === false) {
        return null;
      }

      if (UNLOCK_RETAINED_CUES.has(cueId) && context.userInitiated !== false) {
        this.pendingUnlockCue = { cueId, context };
      }

      try {
        this.scene.sound.unlock?.();
      } catch (error) {
        this.logger?.warn?.("[audio] Browser audio could not be unlocked", error);
      }

      if (this.scene.sound?.locked) {
        return null;
      }

      const pendingCue = this.pendingUnlockCue;
      this.pendingUnlockCue = null;
      return pendingCue
        ? this.sfxDirector.playCue(pendingCue.cueId, pendingCue.context)
        : null;
    }

    this.pendingUnlockCue = null;
    return this.sfxDirector.playCue(cueId, context);
  }

  startLoop(cueId, context = {}) {
    if (this.scene.sound?.locked || this.destroyed) {
      return null;
    }

    return this.sfxDirector.startLoop(cueId, context);
  }

  stopLoop(loopKeyOrSound, options = {}) {
    return this.sfxDirector.stopLoop(loopKeyOrSound, options);
  }

  duckMusic(durationMs = 800) {
    if (this.destroyed) {
      return;
    }

    const now = Number.isFinite(this.scene.time?.now)
      ? this.scene.time.now
      : typeof performance !== "undefined"
        ? performance.now()
        : Date.now();
    this.duckRestoreAt = Math.max(
      this.duckRestoreAt,
      now + Math.max(0, durationMs) + 140,
    );
    this.musicDirector.setDuckFactor(0.7);
    if (typeof this.duckRestoreTimer?.remove === "function") {
      this.duckRestoreTimer.remove(false);
    } else if (this.duckRestoreTimer && typeof clearTimeout === "function") {
      clearTimeout(this.duckRestoreTimer);
    }

    const restore = () => {
      this.duckRestoreTimer = null;
      this.duckRestoreAt = 0;
      this.musicDirector.setDuckFactor(1);
    };
    const restoreDelayMs = Math.max(0, this.duckRestoreAt - now);

    if (this.scene.time?.delayedCall) {
      this.duckRestoreTimer = this.scene.time.delayedCall(
        restoreDelayMs,
        restore,
      );
    } else if (typeof setTimeout === "function") {
      this.duckRestoreTimer = setTimeout(restore, restoreDelayMs);
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.unsubscribeAudioCues?.();
    this.unsubscribeAudioCues = null;
    this.unsubscribeAudioOptions?.();
    this.unsubscribeAudioOptions = null;
    this.scene.sound?.off?.("unlocked", this.handleUnlocked);
    if (typeof this.duckRestoreTimer?.remove === "function") {
      this.duckRestoreTimer.remove(false);
    } else if (this.duckRestoreTimer && typeof clearTimeout === "function") {
      clearTimeout(this.duckRestoreTimer);
    }
    this.duckRestoreTimer = null;
    this.duckRestoreAt = 0;
    this.sfxDirector.destroy();
    this.musicDirector.destroy();
  }
}
