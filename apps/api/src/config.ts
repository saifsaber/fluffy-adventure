import { z } from 'zod';

/**
 * Configuration, read once and validated.
 *
 * Two rules, both of which exist because this repository is public and this service will one day
 * hold a model key and a database password:
 *
 *  - **Nothing is read outside this module.** A `process.env` lookup at a call site is how a
 *    setting acquires three different defaults in three files, and how a secret ends up logged.
 *  - **A missing value with no default is a startup error, not a fallback.** A service that boots
 *    with half its configuration missing fails later, somewhere less obvious, in front of a user.
 *
 * Secrets have no defaults here and no place in this file. When one arrives it arrives as a
 * required field, so the service refuses to start without it rather than running in a mode nobody
 * intended.
 */

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Which league this service resolves matches in. A second country is a second value, not a branch. */
  LEAGUE: z.string().min(1).default('egy-d4'),
});

export interface Config {
  readonly port: number;
  readonly host: string;
  readonly logLevel: z.infer<typeof schema>['LOG_LEVEL'];
  readonly league: string;
}

/** Reads the environment it is handed, so a test can supply one without touching the process. */
export function readConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`configuration is not usable — ${problems.join('; ')}`);
  }
  return {
    port: parsed.data.PORT,
    host: parsed.data.HOST,
    logLevel: parsed.data.LOG_LEVEL,
    league: parsed.data.LEAGUE,
  };
}
