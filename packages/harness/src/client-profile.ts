/**
 * Where the *client* spends its time — `pnpm profile:client`.
 *
 * `profile.ts` does this for the engine and its header carries the lesson that made it exist:
 * guessing did not work, and two "obvious" optimisations measured at exactly nothing. This is the
 * same tool pointed at the browser, and it exists because the same mistake was made again. Reading
 * a 204ms round against a 59ms headless round, the 2026-09-26 log concluded that "roughly seven
 * tenths of a round is React and the DOM". The profile says React and react-dom together are **8%**
 * and the client's own code is **1%**. A subtraction is not a measurement.
 *
 * **The report groups by origin, and that is the whole design.** jsdom implements the DOM in
 * JavaScript where a browser implements it in C++, and vitest and testing-library do not ship to
 * anyone. Time in those frames is an artefact of the instrument; a flat top-25 list would put them
 * at the top and send the next reader optimising the measuring equipment. Only two groups describe
 * work a player pays for — `client` and `engine` — and they are the only two the summary asks you
 * to act on.
 */

export interface CallFrame {
  readonly functionName: string;
  readonly url: string;
  readonly lineNumber: number;
}

export interface CpuProfile {
  readonly nodes: readonly { readonly id: number; readonly callFrame: CallFrame }[];
  readonly samples: readonly number[];
  readonly timeDeltas: readonly number[];
}

/**
 * Who a frame belongs to.
 *
 * `real` marks the two groups that exist in a browser. Everything else is the harness, and is
 * reported so the reader can see how much of the profile is instrument — not so it can be tuned.
 */
export type Origin =
  /** `apps/web/src` — the screens themselves. */
  | 'client'
  /** `packages/engine` — the simulation the screens wait for. */
  | 'engine'
  /** The other workspace packages: season, dashboard, board, content, ai, fixture. */
  | 'packages'
  | 'react'
  | 'jsdom'
  | 'test harness'
  | 'node'
  /** V8 itself: garbage collection, the program frame, idle. Frames with no file. */
  | 'vm/gc'
  | 'other';

export const REAL_ORIGINS: readonly Origin[] = ['client', 'engine', 'packages'];

/** Ordered: the first match wins, so the narrow patterns come before the broad ones. */
const RULES: readonly { readonly origin: Origin; readonly test: (url: string) => boolean }[] = [
  // A frame with no file is V8's own — `(garbage collector)`, `(program)`, `(idle)`. Named rather
  // than left to fall through, because a sixth of this profile is GC and `other` would hide it.
  { origin: 'vm/gc', test: (url) => url === '' },
  { origin: 'client', test: (url) => url.includes('/apps/web/src/') },
  { origin: 'engine', test: (url) => url.includes('/packages/engine/src/') },
  { origin: 'packages', test: (url) => /\/packages\/[a-z-]+\/src\//.test(url) },
  { origin: 'test harness', test: (url) => url.includes('/apps/web/test/') },
  {
    origin: 'jsdom',
    test: (url) =>
      /\/(jsdom|nwsapi|parse5|cssstyle|saxes|symbol-tree|whatwg-url|tough-cookie|rrweb-cssom|html-encoding-sniffer|webidl-conversions|tr46|entities|decimal\.js|xml-name-validator|is-potential-custom-element-name|css-color|css-color-parser|css-calc|css-tokenizer|tldts|http-proxy-agent|agent-base|form-data|mime-types)[@/]/.test(
        url,
      ),
  },
  { origin: 'react', test: (url) => /\/(react|react-dom|scheduler)[@/]/.test(url) },
  {
    origin: 'test harness',
    test: (url) =>
      /(@testing-library|vitest|@vitest|vite-node|tinypool|chai|loupe|dom-accessibility-api|aria-query|expect-type|pathe|magic-string)/.test(
        url,
      ),
  },
  { origin: 'node', test: (url) => url.startsWith('node:') },
];

export function originOf(url: string): Origin {
  return RULES.find((rule) => rule.test(url))?.origin ?? 'other';
}

export interface Frame {
  readonly origin: Origin;
  readonly name: string;
  readonly micros: number;
}

export interface Profiled {
  readonly micros: number;
  readonly byOrigin: ReadonlyMap<Origin, number>;
  readonly frames: readonly Frame[];
}

/**
 * Self time per frame, summed from the sample stream.
 *
 * A sample names the function that was *running*, so summing its deltas gives self time and never
 * double counts a caller — which is the reason this reads the stream rather than the call tree.
 */
export function profiled(profile: CpuProfile): Profiled {
  const frames = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
  const totals = new Map<string, Frame>();
  const byOrigin = new Map<Origin, number>();
  let micros = 0;

  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    const delta = profile.timeDeltas[i];
    if (id === undefined || delta === undefined) continue;
    const frame = frames.get(id);
    if (frame === undefined) continue;

    micros += delta;
    const origin = originOf(frame.url);
    byOrigin.set(origin, (byOrigin.get(origin) ?? 0) + delta);

    const where = frame.url.split('/').slice(-2).join('/');
    const name = `${frame.functionName || '(anonymous)'} @ ${where}:${frame.lineNumber + 1}`;
    const seen = totals.get(name);
    totals.set(name, { origin, name, micros: (seen?.micros ?? 0) + delta });
  }

  return {
    micros,
    byOrigin,
    frames: [...totals.values()].sort((a, b) => b.micros - a.micros),
  };
}

const TOP = 15;

export function report(run: Profiled): readonly string[] {
  if (run.micros === 0) {
    return ['No samples. The work is happening somewhere the sampler cannot see it.'];
  }
  const share = (us: number) => `${((us / run.micros) * 100).toFixed(1).padStart(5)}%`;
  const secs = (us: number) => `${(us / 1e6).toFixed(2).padStart(6)}s`;
  const lines: string[] = [`Sampled ${(run.micros / 1e6).toFixed(2)}s of CPU.`, '', 'By origin:'];

  for (const [origin, us] of [...run.byOrigin].sort((a, b) => b[1] - a[1])) {
    const real = REAL_ORIGINS.includes(origin) ? '  ← ships' : '';
    lines.push(`  ${share(us)}  ${secs(us)}  ${origin}${real}`);
  }

  const shipped = REAL_ORIGINS.reduce((sum, origin) => sum + (run.byOrigin.get(origin) ?? 0), 0);
  lines.push(
    '',
    `${share(shipped)} of this profile is code that ships. The rest is jsdom, vitest and Node,`,
    'which no player runs — do not optimise against it.',
    '',
    'Frames that ship, highest self time first:',
  );

  const mine = run.frames.filter((frame) => REAL_ORIGINS.includes(frame.origin));
  if (mine.length === 0) {
    lines.push('  (none — the sampler saw no frame of ours at all, which is itself the finding)');
    return lines;
  }
  for (const frame of mine.slice(0, TOP)) {
    lines.push(`  ${share(frame.micros)}  ${secs(frame.micros)}  ${frame.origin}  ${frame.name}`);
  }
  return lines;
}
