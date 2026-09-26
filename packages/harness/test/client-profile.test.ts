import { describe, expect, it } from 'vitest';
import {
  REAL_ORIGINS,
  originOf,
  profiled,
  report,
  type CpuProfile,
  type Origin,
} from '../src/client-profile.js';

/**
 * The client profiler's arithmetic and, more importantly, its judgement about what counts.
 *
 * A profiler that adds up wrong is obvious within a run. A profiler that quietly files jsdom under
 * "code that ships" is not — it produces a confident, wrong, actionable-looking list, and somebody
 * spends a day optimising the measuring equipment. That is the failure worth testing for.
 */

const ROOT = '/home/user/fluffy-adventure';

const frame = (functionName: string, url: string, lineNumber = 0) => ({
  functionName,
  url,
  lineNumber,
});

/** Builds a profile in which each node was sampled for the microseconds given. */
function profileOf(entries: readonly (readonly [string, string, number])[]): CpuProfile {
  return {
    nodes: entries.map(([name, url], i) => ({ id: i + 1, callFrame: frame(name, url) })),
    samples: entries.map((_, i) => i + 1),
    timeDeltas: entries.map(([, , us]) => us),
  };
}

describe('a frame is attributed to whoever wrote it', () => {
  const cases: readonly (readonly [string, Origin])[] = [
    [`${ROOT}/apps/web/src/App.tsx`, 'client'],
    [`${ROOT}/apps/web/src/screens/Dashboard.tsx`, 'client'],
    [`${ROOT}/packages/engine/src/chain.ts`, 'engine'],
    [`${ROOT}/packages/season/src/season.ts`, 'packages'],
    [`${ROOT}/packages/dashboard/src/dashboard.ts`, 'packages'],
    [`${ROOT}/apps/web/test/season.test.tsx`, 'test harness'],
    [`${ROOT}/node_modules/.pnpm/jsdom@25.0.1/node_modules/jsdom/lib/api.js`, 'jsdom'],
    [`${ROOT}/node_modules/.pnpm/nwsapi@2.2.0/node_modules/nwsapi/src/nwsapi.js`, 'jsdom'],
    [`${ROOT}/node_modules/.pnpm/react-dom@19.3.0/node_modules/react-dom/cjs/x.js`, 'react'],
    [`${ROOT}/node_modules/.pnpm/@testing-library+react/dist/pure.js`, 'test harness'],
    ['node:internal/modules/esm/loader', 'node'],
    ['', 'vm/gc'],
    ['https://example.invalid/whatever.js', 'other'],
  ];

  for (const [url, origin] of cases) {
    it(`files ${url || '(a frame with no file)'} under ${origin}`, () => {
      expect(originOf(url)).toBe(origin);
    });
  }

  it('keeps the engine apart from the other packages', () => {
    // `/packages/engine/src/` also matches the generic package pattern, so this only holds while
    // the narrower rule comes first. The whole finding of the 2026-09-26 pass was that the engine
    // is 40% of the profile and everything else of ours is 3% — a rule order that merged them
    // would have made that sentence unsayable.
    expect(originOf(`${ROOT}/packages/engine/src/space.ts`)).toBe('engine');
    expect(originOf(`${ROOT}/packages/fixture/src/fixture.ts`)).toBe('packages');
  });

  it('counts only our own code as shipping', () => {
    const shipping = (url: string) => REAL_ORIGINS.includes(originOf(url));
    expect(shipping(`${ROOT}/apps/web/src/App.tsx`)).toBe(true);
    expect(shipping(`${ROOT}/packages/engine/src/chain.ts`)).toBe(true);
    for (const url of [
      `${ROOT}/node_modules/.pnpm/jsdom@25.0.1/node_modules/jsdom/lib/api.js`,
      `${ROOT}/node_modules/.pnpm/react-dom@19.3.0/node_modules/react-dom/cjs/x.js`,
      `${ROOT}/apps/web/test/season.test.tsx`,
      'node:fs',
      '',
    ]) {
      expect(shipping(url)).toBe(false);
    }
  });
});

describe('self time is summed from the sample stream', () => {
  it('adds a frame up across every sample that named it', () => {
    const run = profiled({
      nodes: [{ id: 1, callFrame: frame('hot', `${ROOT}/packages/engine/src/chain.ts`) }],
      samples: [1, 1, 1],
      timeDeltas: [100, 200, 300],
    });
    expect(run.micros).toBe(600);
    expect(run.frames).toHaveLength(1);
    expect(run.frames[0]?.micros).toBe(600);
  });

  it('never double counts a caller, because a sample names only what was running', () => {
    // Both frames are on the stack for the whole run in reality; only the one V8 sampled is
    // charged. A profiler that walked parents would report 200% here.
    const run = profiled(
      profileOf([
        ['caller', `${ROOT}/apps/web/src/App.tsx`, 100],
        ['callee', `${ROOT}/packages/engine/src/chain.ts`, 100],
      ]),
    );
    expect(run.micros).toBe(200);
    expect(run.byOrigin.get('client')).toBe(100);
    expect(run.byOrigin.get('engine')).toBe(100);
  });

  it('ignores a sample whose node it cannot find, rather than inventing a frame for it', () => {
    const run = profiled({
      nodes: [{ id: 1, callFrame: frame('known', `${ROOT}/apps/web/src/App.tsx`) }],
      samples: [1, 99],
      timeDeltas: [50, 5000],
    });
    expect(run.micros).toBe(50);
  });

  it('orders frames by self time, highest first', () => {
    const run = profiled(
      profileOf([
        ['small', `${ROOT}/packages/engine/src/a.ts`, 1],
        ['big', `${ROOT}/packages/engine/src/b.ts`, 9],
        ['middle', `${ROOT}/packages/engine/src/c.ts`, 5],
      ]),
    );
    expect(run.frames.map((f) => f.micros)).toEqual([9, 5, 1]);
  });
});

describe('the report says what ships and lists nothing else', () => {
  const mixed = profiled(
    profileOf([
      ['tacticalPresence', `${ROOT}/packages/engine/src/space.ts`, 400_000],
      [
        'appendChild',
        `${ROOT}/node_modules/.pnpm/jsdom@25.0.1/node_modules/jsdom/lib/n.js`,
        500_000,
      ],
      ['Dashboard', `${ROOT}/apps/web/src/screens/Dashboard.tsx`, 100_000],
      ['(garbage collector)', '', 300_000],
    ]),
  );

  it('puts no frame in the shipping list that does not ship', () => {
    // The point of the whole tool. jsdom is the largest single frame above and must not appear.
    const listed = report(mixed).slice(
      report(mixed).indexOf('Frames that ship, highest self time first:'),
    );
    expect(listed.join('\n')).toContain('tacticalPresence');
    expect(listed.join('\n')).toContain('Dashboard');
    expect(listed.join('\n')).not.toContain('appendChild');
    expect(listed.join('\n')).not.toContain('garbage collector');
  });

  it('states the shipping share, so the reader knows how much of it is instrument', () => {
    // 500k of 1.3M is ours: the engine's 400k plus the client's 100k.
    expect(report(mixed).join('\n')).toContain('38.5% of this profile is code that ships');
  });

  it('reports every origin it saw, including the ones nobody should act on', () => {
    const lines = report(mixed).join('\n');
    for (const origin of ['engine', 'jsdom', 'client', 'vm/gc']) expect(lines).toContain(origin);
  });

  it('says so plainly when the sampler saw nothing, instead of printing an empty table', () => {
    expect(report(profiled({ nodes: [], samples: [], timeDeltas: [] }))).toEqual([
      'No samples. The work is happening somewhere the sampler cannot see it.',
    ]);
  });

  it('says so when it saw samples but none of them were ours', () => {
    // A real outcome, not a hypothetical: it is what a profile of the parent process looks like,
    // and printing an empty list under a confident heading is how that got mistaken for a finding.
    const theirs = profiled(
      profileOf([['appendChild', `${ROOT}/node_modules/.pnpm/jsdom@25.0.1/x/n.js`, 1000]]),
    );
    expect(report(theirs).join('\n')).toContain('the sampler saw no frame of ours at all');
  });
});
