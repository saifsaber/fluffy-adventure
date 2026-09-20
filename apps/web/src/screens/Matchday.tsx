import { useEffect, useState } from 'react';
import type { MatchInput, MatchResult, Side } from '@dakka/engine';
import { causeLabel } from '@dakka/ai';
import { FixtureBar } from '../components/FixtureBar.js';
import { useLocale } from '../i18n/context.js';
import { clubBySlug, dataBySlug, type BrowserLeague } from '../data/league.js';
import { int, signed } from '../format.js';
import { FULL_TIME, beatsFor, pressureAt, reached, scoreAt, type Beat } from '../matchday.js';
import type { Call } from '../match.js';
import type { MessageKey } from '../i18n/index.js';

/**
 * Matchday: the score, the minute, the pressure, your call and what it was worth.
 *
 * Five things visible without hunting a tab, which is the whole requirement. Four of them are here;
 * the fifth — **what your call was worth** — is deliberately not faked into this screen, and that
 * is the honest part of this build.
 *
 * The engine emits no cause in the `decision` domain (see `## Blocked` in the worklog: measured
 * over 1,200 matches, none of the five decision causes ever fires), so there is no swing moment
 * that can be attributed to a substitution or a change of shape. Printing one would be the
 * competitor's failure exactly: a plausible reason attached to a number that did not come from it.
 * What this screen shows instead is that the call **happened**, at its minute, in your own words —
 * and full time hands over to the counterfactual, which measures the call's worth as a paired
 * difference with a standard error. That is a weaker claim per match and a much stronger one
 * overall, and it is true.
 */

const DIAL_LABEL: Record<Call['kind'], MessageKey> = {
  mentality: 'setup.approach',
  line_height: 'setup.line',
  pressing: 'setup.press',
};

const TO_LABEL: Record<string, MessageKey> = {
  defensive: 'mentality.defensive',
  balanced: 'mentality.balanced',
  attacking: 'mentality.attacking',
  deep: 'line.deep',
  normal: 'line.normal',
  high: 'line.high',
  contain: 'press.contain',
  moderate: 'press.moderate',
};

/** `high` means two different things depending on which dial it is on, so the dial picks the key. */
const toKey = (call: Call): MessageKey =>
  call.kind === 'pressing' && call.to === 'high'
    ? 'press.high'
    : (TO_LABEL[call.to] ?? 'line.high');

function BeatRow({ beat }: { readonly beat: Beat }) {
  const { locale, t } = useLocale();
  const goal = beat.kind === 'goal';
  return (
    <li className={`row items-start ${goal ? 'row-mine' : ''}`}>
      <span className="minute">{int(beat.minute)}</span>
      <span className="flex-1">
        {beat.kind === 'goal' && <span className="block text-h2 font-bold">{t('shot.goal')}</span>}
        {beat.kind === 'card' && (
          <span className="block">{t(beat.colour === 'red' ? 'card.red' : 'card.yellow')}</span>
        )}
        {beat.kind === 'call' && (
          <span className="block">
            <span className="font-bold">{t('match.call')}</span> — {t(DIAL_LABEL[beat.call.kind])}:{' '}
            {t(toKey(beat.call))}
          </span>
        )}
        {beat.kind === 'swing' && (
          <>
            <span className="block">{causeLabel(beat.moment.cause, locale)}</span>
            {/* The number is its own element. Interpolated into Arabic prose, `+0.42` renders as
                `0.42+` — the sign detaches and reports a swing towards you as one against. */}
            <span className="text-small text-ink-soft">
              {t('trace.swing')} <span className="num">{signed(beat.delta, 2)}</span>{' '}
              {t(beat.delta >= 0 ? 'trace.favoured.you' : 'trace.favoured.them')}
            </span>
          </>
        )}
      </span>
    </li>
  );
}

export function MatchdayScreen({
  league,
  result,
  asPlayed,
  you,
  call,
  onFullTime,
}: {
  readonly league: BrowserLeague;
  readonly result: MatchResult;
  readonly asPlayed: MatchInput;
  readonly you: Side;
  readonly call: Call | null;
  readonly onFullTime: () => void;
}) {
  const { t } = useLocale();
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    if (minute >= FULL_TIME) return;
    const timer = setTimeout(() => setMinute((current) => current + 1), 200);
    return () => clearTimeout(timer);
  }, [minute]);

  const home = clubBySlug(league, asPlayed.home.club.slug);
  const away = clubBySlug(league, asPlayed.away.club.slug);
  const score = scoreAt(result, minute);
  const pressure = pressureAt(result, minute, you);
  const beats = reached(beatsFor(result, you, call), minute);

  return (
    <div className="grid gap-6">
      <div className="-mx-4 md:-mx-6">
        <FixtureBar
          home={{ club: home, kit: dataBySlug(league, home.slug).kit, region: '' }}
          away={{ club: away, kit: dataBySlug(league, away.slug).kit, region: '' }}
          standing={
            /*
             * Each number is isolated on its own, and the row itself is *not* — so it lays out in
             * the page's direction, exactly like the two clubs beside it. A `.seq` here would pin
             * the pair left-to-right while the clubs flipped, and the score would attach to the
             * wrong side in Arabic. That bug has shipped here once already.
             */
            <span className="flex items-center justify-center gap-2">
              <span className="num text-scoreline font-bold" data-score="home">
                {int(score.home)}
              </span>
              <span aria-hidden className="text-faint font-bold">
                –
              </span>
              <span className="num text-scoreline font-bold" data-score="away">
                {int(score.away)}
              </span>
            </span>
          }
        />
        <p
          className="reversed text-center py-1 tracking-[1.5px]"
          style={{ backgroundColor: 'var(--color-red)' }}
        >
          <span className="num font-bold text-figure">
            {minute === 0 ? t('match.kickoff') : `${int(minute)}'`}
          </span>
        </p>
        {pressure !== undefined && (
          <p className="reversed flex justify-between items-center px-[14px] py-2 m-0">
            <span className="text-label font-bold">{t('match.pressure')}</span>
            <span className="num font-bold text-figure" style={{ color: 'var(--color-gold-lit)' }}>
              {int(Math.round(pressure * 100))}%
            </span>
          </p>
        )}
      </div>

      <section>
        <p className="head">
          <span>{t('trace.title')}</span>
          <span className="text-faint font-normal">{t('match.replay')}</span>
        </p>
        {beats.length === 0 ? (
          <p className="text-small text-ink-soft m-0">{t('match.nothingYet')}</p>
        ) : (
          <ol className="list-none p-0 m-0">
            {beats.map((beat, index) => (
              <BeatRow key={`${beat.kind}-${beat.minute}-${index}`} beat={beat} />
            ))}
          </ol>
        )}
      </section>

      <button type="button" className="action" onClick={onFullTime}>
        {minute >= FULL_TIME ? t('result.fullTime') : t('match.skip')}
      </button>
    </div>
  );
}
