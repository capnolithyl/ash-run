import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SFX_ASSETS } from "../src/game/phaser/audio/SfxCatalog.js";

const SAMPLE_RATE = 44_100;
const CHANNEL_COUNT = 1;
const BITS_PER_SAMPLE = 16;
const MAX_AMPLITUDE = 0.86;

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed) {
  let state = seed || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function envelope(time, duration, attack = 0.012, release = 0.22) {
  const attackGain = Math.min(1, time / Math.max(attack, 0.001));
  const releaseGain = Math.min(1, (duration - time) / Math.max(release, 0.001));
  return Math.max(0, Math.min(attackGain, releaseGain));
}

function oscillator(phase, shape) {
  if (shape === "square") {
    return Math.sin(phase) >= 0 ? 1 : -1;
  }
  if (shape === "triangle") {
    return (2 / Math.PI) * Math.asin(Math.sin(phase));
  }
  if (shape === "saw") {
    return 2 * ((phase / (2 * Math.PI)) % 1) - 1;
  }
  return Math.sin(phase);
}

function synthesizeSample(asset, index, random) {
  const duration = asset.synthesis.durationMs / 1000;
  const time = index / SAMPLE_RATE;
  const progress = time / duration;
  const seed = hashString(asset.id);
  const baseTone = asset.synthesis.toneHz ?? 100 + (seed % 600);
  const variation = ((seed >>> 8) % 31) / 100;
  const noise = random() * 2 - 1;
  const family = asset.synthesis.family;
  let sample = 0;

  if (family === "ui") {
    const descending = asset.id.includes("cancel") || asset.id.includes("danger") || asset.id.includes("invalid");
    const sweep = descending ? 1.18 - progress * 0.42 : 0.86 + progress * 0.3;
    const gate = progress < 0.46 || (progress > 0.6 && !asset.id.includes("hover")) ? 1 : 0.18;
    sample = oscillator(2 * Math.PI * baseTone * sweep * time, "square") * 0.32 * gate;
    sample += Math.sin(2 * Math.PI * baseTone * 2.01 * time) * 0.2 * gate;
    sample += noise * 0.06 * Math.max(0, 1 - progress * 5);
    sample *= envelope(time, duration, 0.003, Math.min(0.08, duration * 0.35));
  } else if (family === "movement") {
    const pulse = 0.45 + Math.max(0, Math.sin(2 * Math.PI * (3 + variation * 4) * time)) * 0.55;
    const engine = oscillator(2 * Math.PI * baseTone * time + Math.sin(time * 21) * 0.8, "triangle");
    sample = engine * 0.33 + oscillator(2 * Math.PI * baseTone * 0.51 * time, "saw") * 0.16;
    sample += noise * (0.09 + pulse * 0.12);
    sample *= envelope(time, duration, 0.018, 0.035) * pulse;
  } else if (family === "weapons") {
    const burstCount = 1 + (seed % 4);
    const burstPhase = (progress * burstCount) % 1;
    const burst = Math.exp(-burstPhase * 10);
    const body = oscillator(2 * Math.PI * baseTone * (1 - progress * 0.45) * time, "square");
    sample = noise * 0.56 * burst + body * 0.35 * burst;
    sample += Math.sin(2 * Math.PI * baseTone * 0.48 * time) * 0.22 * Math.exp(-progress * 6);
    sample *= envelope(time, duration, 0.0015, Math.min(0.12, duration * 0.35));
  } else if (family === "impact") {
    const decay = Math.exp(-progress * (asset.id.includes("destroyed") ? 3.2 : 6.5));
    sample = noise * 0.6 * decay;
    sample += oscillator(2 * Math.PI * baseTone * (1 - progress * 0.6) * time, "triangle") * 0.38 * decay;
    sample += Math.sin(2 * Math.PI * baseTone * 0.45 * time) * 0.24 * Math.exp(-progress * 2.8);
    sample *= envelope(time, duration, 0.001, Math.min(0.15, duration * 0.45));
  } else if (family === "support") {
    const noteIndex = Math.min(3, Math.floor(progress * 4));
    const ratios = [1, 1.25, 1.5, 2];
    const frequency = baseTone * ratios[noteIndex];
    const noteEnvelope = Math.exp(-((progress * 4) % 1) * 4);
    sample = Math.sin(2 * Math.PI * frequency * time) * 0.38 * noteEnvelope;
    sample += oscillator(2 * Math.PI * frequency * 0.5 * time, "triangle") * 0.2;
    sample += noise * 0.05;
    sample *= envelope(time, duration, 0.01, 0.12);
  } else if (family === "transport") {
    const direction = asset.id.includes("unload") ? 1 : -1;
    const sweep = 1 + direction * (progress - 0.5) * 0.7;
    sample = oscillator(2 * Math.PI * baseTone * sweep * time, "saw") * 0.32;
    sample += noise * 0.22 * (0.5 + 0.5 * Math.sin(progress * Math.PI));
    sample += Math.sin(2 * Math.PI * 54 * time) * 0.25;
    sample *= envelope(time, duration, 0.006, 0.13);
  } else if (family === "commander") {
    const commanderVariant = 1 + ((seed % 9) - 4) * 0.045;
    const arpeggio = [1, 1.2, 1.5, 2][Math.min(3, Math.floor(progress * 4))];
    const sweep = 0.68 + progress * 0.72;
    sample = oscillator(2 * Math.PI * baseTone * commanderVariant * sweep * time, "saw") * 0.25;
    sample += Math.sin(2 * Math.PI * baseTone * arpeggio * time) * 0.3;
    sample += noise * 0.12 * Math.sin(progress * Math.PI);
    sample *= envelope(time, duration, 0.018, 0.25);
  } else if (family === "progression") {
    const notes = [1, 1.25, 1.5, 2, 2.5];
    const note = notes[Math.min(notes.length - 1, Math.floor(progress * notes.length))];
    const noteDecay = Math.exp(-((progress * notes.length) % 1) * 3.2);
    sample = Math.sin(2 * Math.PI * baseTone * note * time) * 0.42 * noteDecay;
    sample += oscillator(2 * Math.PI * baseTone * note * 0.5 * time, "triangle") * 0.16;
    sample *= envelope(time, duration, 0.006, 0.13);
  } else if (family === "outcome") {
    const defeat = asset.id.includes("defeat");
    const noteIndex = Math.min(5, Math.floor(progress * 6));
    const victoryNotes = [1, 1.25, 1.5, 2, 2.5, 3];
    const defeatNotes = [1.5, 1.25, 1, 0.84, 0.75, 0.5];
    const note = (defeat ? defeatNotes : victoryNotes)[noteIndex];
    const noteDecay = 0.45 + 0.55 * Math.exp(-((progress * 6) % 1) * 2.8);
    sample = oscillator(2 * Math.PI * baseTone * note * time, "triangle") * 0.34 * noteDecay;
    sample += Math.sin(2 * Math.PI * baseTone * note * 1.5 * time) * 0.22;
    sample += Math.sin(2 * Math.PI * baseTone * note * 0.5 * time) * 0.16;
    sample *= envelope(time, duration, 0.02, 0.35);
  } else {
    const direction = asset.id.includes("enemy") || asset.id.includes("burn") || asset.id.includes("sabotage") ? -1 : 1;
    const sweep = 1 + direction * (progress - 0.5) * 0.3;
    const pulse = 0.65 + 0.35 * Math.sin(2 * Math.PI * (2 + variation * 3) * time);
    sample = oscillator(2 * Math.PI * baseTone * sweep * time, "triangle") * 0.34 * pulse;
    sample += Math.sin(2 * Math.PI * baseTone * 1.5 * time) * 0.18;
    sample += noise * 0.1 * Math.sin(progress * Math.PI);
    sample *= envelope(time, duration, 0.012, 0.2);
  }

  return Math.max(-1, Math.min(1, sample * MAX_AMPLITUDE));
}

export function createWavBuffer(asset) {
  const sampleCount = Math.max(1, Math.round(SAMPLE_RATE * asset.synthesis.durationMs / 1000));
  const dataSize = sampleCount * CHANNEL_COUNT * (BITS_PER_SAMPLE / 8);
  const buffer = Buffer.alloc(44 + dataSize);
  const random = createRandom(hashString(`ash-run-84:${asset.id}`));

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNEL_COUNT, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNEL_COUNT * (BITS_PER_SAMPLE / 8), 28);
  buffer.writeUInt16LE(CHANNEL_COUNT * (BITS_PER_SAMPLE / 8), 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = synthesizeSample(asset, index, random);
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }

  return buffer;
}

function getReadme() {
  const rows = SFX_ASSETS.map((asset) =>
    `| \`${asset.id}\` | \`${asset.url.replace("./assets/audio/sfx/", "")}\` | ${asset.use} |`,
  ).join("\n");

  return `# Ash Run '84 sound effects\n\n` +
    `These WAV files are deterministic, original synthesized effects generated for Ash Run '84. ` +
    `They are production-usable placeholders and contain no sampled third-party material.\n\n` +
    `## Replacing an effect\n\n` +
    `Replace the WAV at the documented path while keeping its filename. Use a 44.1 kHz, 16-bit mono WAV ` +
    `(other browser-supported encodings may work, but the catalog intentionally points to WAV). ` +
    `The generator creates only missing files by default, so running it will not overwrite replacements. ` +
    `After adding or replacing assets, run \`npm run assets:preload\` so the boot preload manifest has current sizes.\n\n` +
    `- Generate only missing effects: \`npm run sfx:generate\`\n` +
    `- Rebuild every synthesized placeholder: \`npm run sfx:generate -- --force\`\n` +
    `- Runtime mix and routing metadata lives in \`src/game/phaser/audio/SfxCatalog.js\`.\n\n` +
    `## Cue catalog\n\n` +
    `| Cue ID | Replaceable file | Use |\n| --- | --- | --- |\n${rows}\n`;
}

export function generateSoundEffects({ rootDir = process.cwd(), force = false } = {}) {
  const created = [];
  const skipped = [];

  for (const asset of SFX_ASSETS) {
    const relativePath = asset.url.replace(/^\.\//, "");
    const outputPath = path.resolve(rootDir, relativePath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    if (!force && fs.existsSync(outputPath)) {
      skipped.push(relativePath);
      continue;
    }

    fs.writeFileSync(outputPath, createWavBuffer(asset));
    created.push(relativePath);
  }

  const readmePath = path.resolve(rootDir, "assets/audio/sfx/README.md");
  if (force || !fs.existsSync(readmePath)) {
    fs.mkdirSync(path.dirname(readmePath), { recursive: true });
    fs.writeFileSync(readmePath, getReadme(), "utf8");
  }

  return { created, skipped, readmePath };
}

function parseArguments(argv) {
  let rootDir = process.cwd();
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force") {
      force = true;
    } else if (argument === "--root" && argv[index + 1]) {
      rootDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argument.startsWith("--root=")) {
      rootDir = path.resolve(argument.slice("--root=".length));
    }
  }

  return { rootDir, force };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = generateSoundEffects(parseArguments(process.argv.slice(2)));
  console.log(
    `[sfx] ${result.created.length} created, ${result.skipped.length} preserved.`,
  );
}
