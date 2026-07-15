import { getSfxCueDefinition, warnSfxOnce } from "./SfxCatalog.js";

const MAX_BATTLEFIELD_PAN = 0.35;
const EVENT_DEDUPE_RETENTION_MS = 10_000;
const KEY_DEDUPE_RETENTION_MS = 120;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashString(value) {
  let hash = 2166136261;

  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function getDeterministicPlaybackRate(cue, context = {}) {
  const variation = Math.max(0, Number(cue?.pitchVariation) || 0);

  if (variation === 0) {
    return 1;
  }

  const identity = [
    cue.id,
    context.eventId ?? "",
    context.dedupeKey ?? "",
    context.source ?? "",
  ].join(":");
  const normalized = (hashString(identity) % 2001) / 1000 - 1;
  return 1 + normalized * variation;
}

export function getConservativePan(pan) {
  return Number.isFinite(Number(pan))
    ? clamp(Number(pan), -MAX_BATTLEFIELD_PAN, MAX_BATTLEFIELD_PAN)
    : 0;
}

function getClock(scene) {
  if (Number.isFinite(scene?.time?.now)) {
    return scene.time.now;
  }

  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export class SoundEffectsDirector {
  constructor(scene, { onDuck = null, logger = console } = {}) {
    this.scene = scene;
    this.onDuck = onDuck;
    this.logger = logger;
    this.categoryVolume = 0.85;
    this.lastPlayedAt = new Map();
    this.dedupeHistory = new Map();
    this.voices = new Map();
    this.loops = new Map();
    this.missingWarnings = new Set();
    this.destroyed = false;
  }

  setCategoryVolume(volume) {
    this.categoryVolume = Number.isFinite(Number(volume))
      ? clamp(Number(volume), 0, 1)
      : 0.85;

    for (const activeVoices of this.voices.values()) {
      for (const voice of activeVoices) {
        const baseGain = Number(voice.__ashRunSfxGain) || 0;
        voice.setVolume?.(baseGain * this.categoryVolume);
      }
    }
  }

  playCue(cueId, context = {}) {
    if (this.destroyed) {
      return null;
    }

    const cue = getSfxCueDefinition(cueId);

    if (!cue) {
      this.warnOnce(cueId, `Unknown sound cue: ${cueId}`);
      return null;
    }

    if (this.scene.sound?.locked) {
      return null;
    }

    if (!this.scene.cache?.audio?.exists?.(cue.key)) {
      warnSfxOnce(cue.key, `Sound asset is unavailable: ${cue.url}`, null, this.logger);
      return null;
    }

    const now = getClock(this.scene);
    const dedupeIdentity = context.eventId != null
      ? `event:${context.eventId}:${context.dedupeKey ?? ""}:${cueId}`
      : context.dedupeKey
        ? `key:${context.dedupeKey}:${cueId}`
        : null;

    this.pruneDedupeHistory(now);

    if (dedupeIdentity && this.dedupeHistory.has(dedupeIdentity)) {
      return null;
    }

    const lastPlayedAt = this.lastPlayedAt.get(cueId);

    if (lastPlayedAt != null && now - lastPlayedAt < cue.cooldownMs) {
      return null;
    }

    const activeVoices = this.voices.get(cueId) ?? [];
    this.removeStoppedVoices(activeVoices);

    while (activeVoices.length >= cue.maxVoices) {
      const oldestVoice = activeVoices.shift();
      oldestVoice?.stop?.();
      oldestVoice?.destroy?.();
    }

    let sound;

    try {
      sound = this.scene.sound.add(cue.key);
      const baseGain = cue.gain;
      const playbackConfig = {
        loop: context.loop ?? cue.loop,
        volume: baseGain * this.categoryVolume,
        rate: getDeterministicPlaybackRate(cue, context),
      };

      if (cue.pan && Number.isFinite(Number(context.pan))) {
        playbackConfig.pan = getConservativePan(context.pan);
      }

      sound.__ashRunSfxGain = baseGain;
      const played = sound.play(playbackConfig);
      if (played === false) {
        sound.destroy?.();
        return null;
      }
    } catch (error) {
      this.warnOnce(cue.key, `Could not play sound asset ${cue.url}`, error);
      sound?.destroy?.();
      return null;
    }

    activeVoices.push(sound);
    this.voices.set(cueId, activeVoices);
    this.lastPlayedAt.set(cueId, now);

    if (dedupeIdentity) {
      const retentionMs = context.eventId != null
        ? EVENT_DEDUPE_RETENTION_MS
        : Math.max(0, Number(context.dedupeWindowMs) || KEY_DEDUPE_RETENTION_MS);
      this.dedupeHistory.set(dedupeIdentity, now + retentionMs);
    }

    const cleanup = () => this.removeVoice(cueId, sound);
    sound.once?.("complete", () => {
      cleanup();
      sound.destroy?.();
    });
    sound.once?.("destroy", cleanup);

    if (cue.duckMusic) {
      const loadedDurationMs = Number.isFinite(Number(sound.duration))
        ? Number(sound.duration) * 1000
        : 0;
      this.onDuck?.(Math.max(cue.durationMs, loadedDurationMs));
    }

    return sound;
  }

  startLoop(cueId, context = {}) {
    const loopKey = context.loopKey
      ?? `${cueId}:${context.source ?? context.eventId ?? "default"}`;
    const existing = this.loops.get(loopKey);

    if (existing?.isPlaying && !existing.__ashRunSfxStopping) {
      return existing;
    }

    const sound = this.playCue(cueId, {
      ...context,
      loop: true,
      dedupeKey: null,
      eventId: null,
    });

    if (sound) {
      sound.__ashRunSfxLoopKey = loopKey;
      this.loops.set(loopKey, sound);
    }

    return sound;
  }

  stopLoop(loopKeyOrSound, { fadeMs = 80 } = {}) {
    const loopKey = typeof loopKeyOrSound === "string"
      ? loopKeyOrSound
      : loopKeyOrSound?.__ashRunSfxLoopKey;
    const sound = typeof loopKeyOrSound === "string"
      ? this.loops.get(loopKeyOrSound)
      : loopKeyOrSound;

    if (!sound) {
      return false;
    }

    const finish = () => {
      sound.stop?.();
      sound.destroy?.();
      if (loopKey && this.loops.get(loopKey) === sound) {
        this.loops.delete(loopKey);
      }
    };

    sound.__ashRunSfxStopping = true;
    if (loopKey && this.loops.get(loopKey) === sound) {
      this.loops.delete(loopKey);
    }

    if (fadeMs > 0 && this.scene.tweens?.add) {
      this.scene.tweens.killTweensOf?.(sound);
      this.scene.tweens.add({
        targets: sound,
        volume: 0,
        duration: fadeMs,
        ease: "Sine.easeOut",
        onComplete: finish,
      });
    } else {
      finish();
    }

    return true;
  }

  removeStoppedVoices(activeVoices) {
    for (let index = activeVoices.length - 1; index >= 0; index -= 1) {
      const sound = activeVoices[index];

      if (!sound?.isPlaying && !sound?.isPaused) {
        activeVoices.splice(index, 1);
        sound?.destroy?.();
      }
    }
  }

  removeVoice(cueId, sound) {
    const activeVoices = this.voices.get(cueId);

    if (activeVoices) {
      const index = activeVoices.indexOf(sound);
      if (index >= 0) {
        activeVoices.splice(index, 1);
      }
      if (activeVoices.length === 0) {
        this.voices.delete(cueId);
      }
    }

    const loopKey = sound?.__ashRunSfxLoopKey;
    if (loopKey && this.loops.get(loopKey) === sound) {
      this.loops.delete(loopKey);
    }
  }

  pruneDedupeHistory(now) {
    for (const [identity, expiresAt] of this.dedupeHistory) {
      if (now >= expiresAt) {
        this.dedupeHistory.delete(identity);
      }
    }
  }

  warnOnce(identity, message, error = null) {
    if (this.missingWarnings.has(identity)) {
      return;
    }

    this.missingWarnings.add(identity);
    this.logger?.warn?.(`[audio] ${message}`, ...(error ? [error] : []));
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    for (const activeVoices of this.voices.values()) {
      for (const sound of [...activeVoices]) {
        this.scene.tweens?.killTweensOf?.(sound);
        sound.stop?.();
        sound.destroy?.();
      }
    }

    this.voices.clear();
    this.loops.clear();
    this.lastPlayedAt.clear();
    this.dedupeHistory.clear();
  }
}
