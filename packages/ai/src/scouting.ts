import type { ClubId, MatchResult, PlayerId, Shot } from '@dakka/engine';
import type { Locale } from './locale.js';

/**
 * What you know about the opponent, and how you came to know it.
 *
 * **You scout by watching.** Every figure here is counted from matches you actually saw, never read
 * off their squad — a fourth-division manager cannot open a rival's player attributes, and neither
 * can this model. That is the whole guard: `scoutingFrom` takes `MatchResult[]`, and a `Club` does
 * not typecheck in its place, so the hidden numbers have no route to a prompt.
 *
 * The honest consequence is that a side you have never played produces an almost empty record, and
 * the briefing says so in one line instead of inventing a reputation. That is the same rule the
 * debrief lives under: thin evidence, short output, and no filling of gaps.
 *
 * Note what is *absent* rather than zero. Shot shares exist only once there are shots to divide;
 * with nothing observed they are `undefined`, because "they never shoot from range" and "we have
 * not seen them shoot" are different claims and only one of them is true.
 */
export interface ScoutingRecord {
  readonly clubId: ClubId;
  /** Matches of theirs you have seen. Everything below is counted from exactly these. */
  readonly observed: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly shots: number;
  readonly shotsOnTarget: number;
  /** Sum of their shots' xG across the observed matches. Derived, never assigned. */
  readonly xg: number;
  readonly yellowCards: number;
  readonly redCards: number;
  /** Absent until there is at least one shot to take a share of. */
  readonly fromSetPieces?: number;
  readonly fromCounters?: number;
  readonly fromCloseRange?: number;
  /** Who scored against you, most first. Names are resolved by the caller, never guessed here. */
  readonly scorers: readonly { readonly playerId: PlayerId; readonly goals: number }[];
}

const CLOSE_RANGE_M = 12;

/**
 * Builds the record from matches, and from nothing else.
 *
 * Results the club did not play in are skipped rather than throwing: a caller handing over a season
 * of fixtures should get the ones that matter, not an error about the ones that do not.
 */
export function scoutingFrom(results: readonly MatchResult[], clubId: ClubId): ScoutingRecord {
  let observed = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let yellowCards = 0;
  let redCards = 0;
  const theirShots: Shot[] = [];
  const goals = new Map<PlayerId, number>();

  for (const result of results) {
    const side =
      result.homeClubId === clubId ? 'home' : result.awayClubId === clubId ? 'away' : null;
    if (side === null) continue;
    observed += 1;

    goalsFor += side === 'home' ? result.homeScore : result.awayScore;
    goalsAgainst += side === 'home' ? result.awayScore : result.homeScore;

    const stats = side === 'home' ? result.stats.home : result.stats.away;
    yellowCards += stats.yellowCards;
    redCards += stats.redCards;

    for (const shot of result.shots) if (shot.side === side) theirShots.push(shot);
    for (const event of result.events) {
      if (event.kind === 'goal' && event.side === side) {
        goals.set(event.scorer, (goals.get(event.scorer) ?? 0) + 1);
      }
    }
  }

  const shots = theirShots.length;
  const share = (predicate: (shot: Shot) => boolean): number =>
    theirShots.filter(predicate).length / shots;

  return {
    clubId,
    observed,
    goalsFor,
    goalsAgainst,
    shots,
    shotsOnTarget: theirShots.filter((s) => s.outcome === 'goal' || s.outcome === 'saved').length,
    xg: theirShots.reduce((sum, shot) => sum + shot.xg, 0),
    yellowCards,
    redCards,
    ...(shots === 0
      ? {}
      : {
          fromSetPieces: share((s) => s.situation === 'set_piece'),
          fromCounters: share((s) => s.situation === 'counter'),
          fromCloseRange: share((s) => s.distanceM < CLOSE_RANGE_M),
        }),
    scorers: [...goals.entries()]
      .map(([playerId, count]) => ({ playerId, goals: count }))
      .sort((a, b) => b.goals - a.goals || String(a.playerId).localeCompare(String(b.playerId))),
  };
}

/** Resolved names for the players a record counts. Absent means unnamed, never invented. */
export type ScoutNames = ReadonlyMap<PlayerId, string>;

export interface BriefingPrompt {
  readonly locale: Locale;
  readonly system: string;
  /** The only part carrying anything about the opponent. */
  readonly scouting: string;
  readonly task: string;
  readonly observed: number;
}

const SYSTEM: Record<Locale, string> = {
  'ar-EG': [
    'إنت مساعد مدرب مصري بتجهّز مديرك للماتش الجاي. بتتكلم مصري ومختصر.',
    'قواعد ماتكسرهاش:',
    '- ماتقولش عن الخصم غير اللي مكتوب تحت في "اللي شوفناه". ماتخمّنش وماتفتريش.',
    '- اللي مشوفناهوش يتقال إننا مشوفناهوش، مش يتعوّض بكلام عام.',
    '- الأرقام بأرقام لاتينية، والمصطلحات اللاتينية زي xG تفضل زي ما هي.',
  ].join('\n'),
  en: [
    'You are an assistant coach briefing your manager before the next match. Short and plain.',
    'Rules you do not break:',
    '- Say nothing about the opponent that is not listed under "What we have seen". Do not guess.',
    '- What we have not seen is reported as not seen, never replaced with a general impression.',
    '- Keep technical terms as they are: xG.',
  ].join('\n'),
};

const HEAD: Record<Locale, { seen: string; never: string }> = {
  'ar-EG': {
    seen: 'اللي شوفناه منهم:',
    never: 'مالعبناهمش قبل كده. مفيش عندنا حاجة عنهم غير الاسم.',
  },
  en: {
    seen: 'What we have seen of them:',
    never: 'We have never played them. We have nothing on them but the name.',
  },
};

const TASK: Record<Locale, (observed: number) => string> = {
  'ar-EG': (observed) =>
    observed === 0
      ? 'قول جملة واحدة إننا مانعرفش عنهم حاجة، وخلاص. ماتنصحش بحاجة مبنية على لا شيء.'
      : 'إكتب فقرتين قصار: خطرهم فين، وإيه اللي تعمله عشانه.',
  en: (observed) =>
    observed === 0
      ? 'Say in one sentence that we know nothing about them, and stop. Do not advise on nothing.'
      : 'Write two short paragraphs: where their threat is, and what to do about it.',
};

const pct = (value: number): string => String(Math.round(value * 100));

/**
 * The briefing prompt.
 *
 * Same shape as the debrief's, for the same reason: the opponent facts live in one block so that
 * "every number here was counted from a match we watched" is a testable claim about that block
 * alone, while the instructions are free to carry numbers of their own.
 */
export function briefingPrompt(
  record: ScoutingRecord,
  opponent: string,
  locale: Locale,
  names: ScoutNames = new Map(),
): BriefingPrompt {
  const head = HEAD[locale];
  const lines: string[] = [];

  if (record.observed === 0) {
    lines.push(head.never);
  } else {
    const ar = locale === 'ar-EG';
    lines.push(head.seen);
    lines.push(
      ar
        ? `- لعبنا ضدهم ${record.observed} مرات. جابوا ${record.goalsFor} ودخلهم ${record.goalsAgainst}.`
        : `- ${record.observed} matches seen. They scored ${record.goalsFor}, conceded ${record.goalsAgainst}.`,
    );
    lines.push(
      ar
        ? `- سددوا ${record.shots}، منهم ${record.shotsOnTarget} على المرمى. مجموع الـ xG بتاعهم ${record.xg.toFixed(2)}.`
        : `- ${record.shots} shots, ${record.shotsOnTarget} on target, ${record.xg.toFixed(2)} xG in total.`,
    );
    if (record.fromSetPieces !== undefined) {
      lines.push(
        ar
          ? `- ${pct(record.fromSetPieces)}% من تسديداتهم من كورة ثابتة، و${pct(record.fromCounters ?? 0)}% من مرتد، و${pct(record.fromCloseRange ?? 0)}% من جوه المنطقة.`
          : `- ${pct(record.fromSetPieces)}% of their shots came from set pieces, ${pct(record.fromCounters ?? 0)}% from counters, ${pct(record.fromCloseRange ?? 0)}% from close range.`,
      );
    }
    if (record.redCards > 0 || record.yellowCards > 0) {
      lines.push(
        ar
          ? `- خدوا ${record.yellowCards} كارت أصفر و${record.redCards} أحمر.`
          : `- ${record.yellowCards} yellow cards and ${record.redCards} red.`,
      );
    }
    for (const scorer of record.scorers.slice(0, 3)) {
      const name = names.get(scorer.playerId);
      if (name === undefined) continue;
      lines.push(
        ar ? `- ${name} جاب ${scorer.goals} فينا.` : `- ${name} scored ${scorer.goals} against us.`,
      );
    }
  }

  return {
    locale,
    system: SYSTEM[locale],
    scouting: lines.join('\n'),
    task: TASK[locale](record.observed),
    observed: record.observed,
  };
}
