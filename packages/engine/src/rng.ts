/**
 * The engine's only source of chance.
 *
 * Every probabilistic decision in a match draws from an `Rng` handed to it. Nothing calls a global
 * random function, which is what makes `simulate(seed, input)` reproducible byte for byte — and
 * that single property is what buys counterfactual replay, a genuinely fair daily challenge, honest
 * PvP, and bug reports that can be re-run. They break together or not at all.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p` (default 0.5). */
  bool(p?: number): boolean;
  /** Uniform choice from a non-empty array. */
  pick<T>(items: readonly [T, ...T[]]): T;
  /** A fresh generator whose stream is derived from this one's seed and a label. */
  fork(label: string): Rng;
}

/**
 * Expands a seed string into four 32-bit words.
 *
 * Avalanche matters here: `"round-12"` and `"round-13"` must produce completely unrelated streams,
 * or consecutive matches in a season would correlate. Each word uses a different multiplier and
 * rotation, then a MurmurHash3-style finaliser, which gives that property cheaply.
 */
function seedWords(seed: string): [number, number, number, number] {
  let h1 = 0x9e3779b9 ^ seed.length;
  let h2 = 0x85ebca6b ^ seed.length;
  let h3 = 0xc2b2ae35 ^ seed.length;
  let h4 = 0x27d4eb2f ^ seed.length;

  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ k, 2654435761);
    h2 = Math.imul(h2 ^ k, 1597334677);
    h3 = Math.imul(h3 ^ k, 951274213);
    h4 = Math.imul(h4 ^ k, 2246822507);
    h1 = (h1 << 13) | (h1 >>> 19);
    h2 = (h2 << 7) | (h2 >>> 25);
    h3 = (h3 << 17) | (h3 >>> 15);
    h4 = (h4 << 11) | (h4 >>> 21);
  }

  const mix = (h: number): number => {
    let x = h;
    x ^= x >>> 16;
    x = Math.imul(x, 2246822507);
    x ^= x >>> 13;
    x = Math.imul(x, 3266489909);
    x ^= x >>> 16;
    return x >>> 0;
  };

  // Never hand the generator an all-zero state: sfc32 cannot escape it.
  return [mix(h1) || 1, mix(h2) || 2, mix(h3) || 3, mix(h4) || 4];
}

/**
 * sfc32 — Small Fast Counter, 128 bits of state.
 *
 * Chosen over the more commonly copied mulberry32 for one concrete reason: mulberry32 holds 32 bits
 * of state and repeats after about 4.3 billion draws. A single 10,000-season harness run makes
 * billions of draws, which would put a balance experiment inside the repeat window — the harness
 * would then be measuring the generator rather than the engine. sfc32's period is at least 2^64,
 * typically far longer, and it clears PractRand.
 */
function sfc32(seed: string): () => number {
  let [a, b, c, d] = seedWords(seed);

  const draw = (): number => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };

  // Discard the first draws so seeds sharing a prefix separate immediately.
  for (let i = 0; i < 15; i++) draw();
  return draw;
}

export function createRng(seed: string): Rng {
  const draw = sfc32(seed);

  const rng: Rng = {
    next: draw,

    int(min: number, max: number): number {
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        throw new RangeError(`int() needs integer bounds, received ${min}..${max}`);
      }
      if (max < min) throw new RangeError(`int() needs max >= min, received ${min}..${max}`);
      return min + Math.floor(draw() * (max - min + 1));
    },

    bool(p = 0.5): boolean {
      return draw() < p;
    },

    pick<T>(items: readonly [T, ...T[]]): T {
      // The tuple type guarantees at least one element, so this index is always in range.
      return items[Math.floor(draw() * items.length)] as T;
    },

    /**
     * A named substream.
     *
     * Lets one part of the engine draw without shifting every later draw elsewhere — so adding a
     * coin flip to, say, injury checks does not silently change every subsequent shot. That
     * stability is what makes a counterfactual comparison meaningful: the run differs because the
     * decision differed, not because the draw order moved.
     */
    fork(label: string): Rng {
      return createRng(`${seed} ${label} ${draw()}`);
    },
  };

  return rng;
}
