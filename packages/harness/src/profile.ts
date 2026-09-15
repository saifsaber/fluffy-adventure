/* eslint-disable no-console */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `pnpm profile` — where the harness actually spends its time.
 *
 * This exists because guessing did not work. Two "obvious" optimisations were shipped to a branch
 * and measured at exactly nothing (see the 2026-09-15 log entry); the profile that replaced the
 * guessing found 40% of total CPU in `bandOf` and `channelOf`, which nobody would have picked.
 *
 * **The flag that matters is `--import tsx`, not `tsx`.** Run as `tsx cli.ts`, tsx re-executes the
 * program in a *child* process and `--cpu-prof` samples the idle parent — which is what produced
 * the "98% idle" profile previously recorded here as an unsolved obstacle. It was never a loader
 * limitation and never needed a compiled build.
 *
 * Everything after `--` is forwarded to the harness, so `pnpm profile -- --seasons=12` profiles a
 * twelve-season run.
 */

const TOP = 25;

interface CallFrame {
  readonly functionName: string;
  readonly url: string;
  readonly lineNumber: number;
}
interface ProfileNode {
  readonly id: number;
  readonly callFrame: CallFrame;
}
interface CpuProfile {
  readonly nodes: readonly ProfileNode[];
  readonly samples: readonly number[];
  readonly timeDeltas: readonly number[];
}

/** Self time per function, summed from the sample stream. Microseconds. */
export function selfTimes(profile: CpuProfile): Map<string, number> {
  const frames = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
  const totals = new Map<string, number>();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    const delta = profile.timeDeltas[i];
    if (id === undefined || delta === undefined) continue;
    const frame = frames.get(id);
    if (frame === undefined) continue;
    const file = frame.url.split('/').pop() ?? frame.url;
    const key = `${frame.functionName || '(anonymous)'} @ ${file}:${frame.lineNumber + 1}`;
    totals.set(key, (totals.get(key) ?? 0) + delta);
  }
  return totals;
}

export function report(totals: Map<string, number>, log: (line: string) => void): void {
  const rows = [...totals].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((sum, [, us]) => sum + us, 0);
  if (total === 0) {
    log('No samples. The work is happening somewhere the sampler cannot see it.');
    return;
  }
  log(`Sampled ${(total / 1e6).toFixed(2)}s of CPU. Self time, highest first:`);
  log('');
  for (const [name, us] of rows.slice(0, TOP)) {
    const share = ((us / total) * 100).toFixed(2).padStart(6);
    log(`  ${share}%  ${(us / 1e6).toFixed(2).padStart(6)}s  ${name}`);
  }
}

function main(argv: readonly string[]): number {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'dakka-prof-'));
  try {
    const run = spawnSync(
      process.execPath,
      ['--cpu-prof', `--cpu-prof-dir=${dir}`, '--import', 'tsx', join(here, 'cli.ts'), ...argv],
      { stdio: 'inherit' },
    );
    // A missed threshold is not a profiling failure. `--seasons=3` fails the xG check on sample
    // size alone, and swallowing the profile for that would make the tool look broken exactly when
    // it is cheapest to run. The harness prints its own verdict above; this command's contract is
    // narrower — it exits non-zero only when it could not produce a profile.
    const file = readdirSync(dir).find((name) => name.endsWith('.cpuprofile'));
    if (file === undefined) {
      console.error(
        run.status === 0
          ? 'No .cpuprofile was written.'
          : `The harness exited ${String(run.status)} before a profile was written.`,
      );
      return 1;
    }
    console.log('');
    report(selfTimes(JSON.parse(readFileSync(join(dir, file), 'utf8')) as CpuProfile), (line) =>
      console.log(line),
    );
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

process.exitCode = main(process.argv.slice(2));
