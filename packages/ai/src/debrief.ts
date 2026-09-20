import { ALL_CAUSES, type CauseTag } from '@dakka/engine';
import type { Locale } from './locale.js';
import type { MatchEvidence } from './evidence.js';
import { PHRASINGS } from './phrasing.js';
import { numbersInText, type DebriefPrompt } from './prompt.js';

/**
 * Asking for a debrief, and refusing to show a bad one.
 *
 * **The transport is a seam, not an implementation.** Nothing here opens a socket or reads a key —
 * the purity guard in this package fails the build on either. Step 8's API supplies the real
 * transport; until then a caller passes whatever it has, and everything around it is already built
 * and tested.
 *
 * The part that matters is the return trip. A prompt that only contains trace facts does not
 * guarantee a reply that only contains trace facts: a model can and will add a plausible number or
 * mention possession because debriefs usually do. That is the competitor's failure arriving through
 * the back door, so the reply is checked before anyone sees it, and a reply that fails is **not
 * shown at all**. The trace is already honest on its own; a missing debrief costs the player a
 * paragraph, while a fabricated one costs the product its only claim.
 */

/** Whatever can turn a prompt into text. The real one lives behind the API. */
export type DebriefTransport = (prompt: DebriefPrompt) => Promise<string>;

export type DebriefOutcome =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Statistics the trace does not carry, so a debrief mentioning one is inventing it.
 *
 * Deliberately short. `shots` and `corners` are *absent* from this list on purpose: "they were
 * dangerous from corners" is a fair reading of a `SET_PIECE_ADVANTAGE` moment, and any actual count
 * attached to one is caught by the number rule below instead. A guard with false positives gets
 * switched off, so it only names concepts the trace can never support at all.
 */
const UNCARRIED: Record<Locale, readonly string[]> = {
  'ar-EG': ['الاستحواذ', 'استحواذ', 'xG', 'التمريرات', 'التسلل', 'نسبة التمرير'],
  en: ['possession', 'xG', 'pass completion', 'offside', 'expected goals'],
};

/**
 * Roughly two lines per paragraph, per `dakka-arabic-voice`. Long output is a failure, not thoroughness.
 *
 * Exported because `cost.ts` sets `max_tokens` from it. A reply longer than this ceiling is thrown
 * away by rule 4 below, so paying a model to keep writing past it buys nothing at all — the length
 * rule and the spend cap have to be the same number or one of them is wrong.
 */
export const CHARS_PER_PARAGRAPH = 260;

const paragraphsIn = (text: string): readonly string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '');

/**
 * Everything a debrief is allowed to contain, checked against the evidence it was built from.
 *
 * Pure and synchronous, so it can be run over a stored debrief later — after a model change, after
 * a prompt change — without a transport in sight.
 */
export function checkDebrief(
  text: string,
  evidence: MatchEvidence,
  prompt: DebriefPrompt,
): DebriefOutcome {
  const problems: string[] = [];
  const body = text.trim();

  if (body === '') return { ok: false, problems: ['the model returned nothing'] };

  // 1. Numbers. The same rule the prompt is held to, applied to the reply.
  const minutes = new Set(evidence.moments.map((moment) => Math.round(moment.minute)));
  const counts = new Set(
    [...new Set(evidence.moments.map((moment) => moment.cause))].map(
      (cause) => evidence.moments.filter((moment) => moment.cause === cause).length,
    ),
  );
  for (const value of numbersInText(body)) {
    if (!minutes.has(value) && !counts.has(value)) {
      problems.push(`${value} is not a minute or a count the trace produced`);
    }
  }

  // 2. Statistics the trace never carried, with or without a number attached.
  for (const term of UNCARRIED[evidence.locale]) {
    if (body.includes(term)) problems.push(`mentions "${term}", which the trace does not contain`);
  }

  // 3. Causes that did not happen. A cause named here is a reason invented for the match.
  const happened = new Set<CauseTag>(evidence.moments.map((moment) => moment.cause));
  for (const cause of ALL_CAUSES) {
    if (happened.has(cause)) continue;
    if (body.includes(PHRASINGS[cause][evidence.locale].label)) {
      problems.push(`names ${cause}, which did not happen in this match`);
    }
  }

  // 4. Length. The prompt asked for a ceiling because the evidence supports one.
  const paragraphs = paragraphsIn(body);
  if (paragraphs.length > prompt.maxParagraphs) {
    problems.push(`${paragraphs.length} paragraphs, ${prompt.maxParagraphs} were asked for`);
  }
  const ceiling = prompt.maxParagraphs * CHARS_PER_PARAGRAPH;
  if (body.length > ceiling) {
    problems.push(`${body.length} characters, the ceiling for this trace is ${ceiling}`);
  }

  return problems.length === 0 ? { ok: true, text: body } : { ok: false, problems };
}

/**
 * Asks, then checks. Never throws, and never returns text it has not checked.
 *
 * A transport failure is an ordinary outcome rather than an exception: the network is allowed to be
 * down, and the screen's answer to that is the same as its answer to a bad reply — show the trace,
 * say the debrief is not available, and do not guess.
 */
export async function requestDebrief(
  transport: DebriefTransport,
  prompt: DebriefPrompt,
  evidence: MatchEvidence,
): Promise<DebriefOutcome> {
  let reply: string;
  try {
    reply = await transport(prompt);
  } catch (cause) {
    return { ok: false, problems: [`the transport failed — ${(cause as Error).message}`] };
  }
  if (typeof reply !== 'string') {
    return { ok: false, problems: ['the transport returned something that is not text'] };
  }
  return checkDebrief(reply, evidence, prompt);
}

/**
 * The key a stored debrief lives under.
 *
 * Built from the things that change the answer and nothing else. Because the engine is
 * deterministic, the same match asked twice is the same match — so a debrief is bought once, which
 * is a correctness property first and a cost control second. `engineVersion` is in the key because
 * a rebalanced engine produces a different trace for the same seed, and last week's debrief would
 * then describe a match that no longer happens.
 */
export function debriefCacheKey(input: {
  readonly engineVersion: string;
  readonly seed: string;
  readonly side: 'home' | 'away';
  readonly locale: Locale;
}): string {
  return `debrief/${input.engineVersion}/${input.seed}/${input.side}/${input.locale}`;
}
