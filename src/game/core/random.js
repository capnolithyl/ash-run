/**
 * The simulation uses a tiny deterministic generator so battle outcomes
 * remain reproducible inside a saved run.
 */
export function stringToSeed(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function nextRandom(seed) {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

  const nextSeed = value ^ (value >>> 14);

  return {
    seed: nextSeed >>> 0,
    value: (nextSeed >>> 0) / 4294967296
  };
}

export function randomInt(seed, minimum, maximum) {
  const next = nextRandom(seed);
  const span = maximum - minimum + 1;

  return {
    seed: next.seed,
    value: minimum + Math.floor(next.value * span)
  };
}

export function pickOne(seed, items) {
  const next = randomInt(seed, 0, items.length - 1);
  return {
    seed: next.seed,
    value: items[next.value]
  };
}

export function pickWeighted(seed, weightedItems) {
  const normalizedItems = weightedItems
    .map((entry) => ({
      ...entry,
      weight: Math.max(0, Math.floor(entry.weight ?? 0))
    }))
    .filter((entry) => entry.weight > 0);

  if (normalizedItems.length === 0) {
    return {
      seed,
      value: null
    };
  }

  const totalWeight = normalizedItems.reduce((sum, entry) => sum + entry.weight, 0);
  const roll = randomInt(seed, 1, totalWeight);
  let remaining = roll.value;

  for (const entry of normalizedItems) {
    remaining -= entry.weight;

    if (remaining <= 0) {
      return {
        seed: roll.seed,
        value: entry.value
      };
    }
  }

  return {
    seed: roll.seed,
    value: normalizedItems[normalizedItems.length - 1].value
  };
}

export function shuffle(seed, items) {
  const cloned = [...items];
  let currentSeed = seed;

  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const next = randomInt(currentSeed, 0, index);
    currentSeed = next.seed;

    const temp = cloned[index];
    cloned[index] = cloned[next.value];
    cloned[next.value] = temp;
  }

  return {
    seed: currentSeed,
    value: cloned
  };
}
