import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/**
 * Does this snippet compile against `@dakka/ai`?
 *
 * Some of this package's guarantees are compile-time by design — an unvalidated effect literal and a
 * `MatchResult` in a prompt's place are both supposed to be impossible to write, not merely wrong at
 * runtime. A runtime test cannot observe that, and a comment saying "the types prevent this" is a
 * claim nobody checks. So the test compiles the forbidden snippet and asserts the compiler refused.
 *
 * Files land in `test/__compile__`, which the package tsconfig excludes, so a leftover from a
 * crashed run cannot break the workspace build.
 */

const DIR = join(import.meta.dirname, '__compile__');

export interface CompileResult {
  readonly ok: boolean;
  readonly messages: readonly string[];
}

export function compiles(name: string, source: string): CompileResult {
  mkdirSync(DIR, { recursive: true });
  const file = join(DIR, `${name}.ts`);
  writeFileSync(file, source, 'utf8');
  try {
    const config = ts.readConfigFile(
      join(import.meta.dirname, '..', 'tsconfig.json'),
      ts.sys.readFile,
    );
    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      join(import.meta.dirname, '..'),
    );
    const program = ts.createProgram([file], {
      ...parsed.options,
      noEmit: true,
      composite: false,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file?.fileName === file.replace(/\\/g, '/'));
    return {
      ok: diagnostics.length === 0,
      messages: diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')),
    };
  } finally {
    rmSync(file, { force: true });
  }
}
