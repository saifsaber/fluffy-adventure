import type { MatchInput, MatchResult, Side } from '@dakka/engine';
import { useT } from '../i18n/context.js';
import { Counterfactual } from '../components/Counterfactual.js';
import { Stats } from '../components/Stats.js';
import { Trace } from '../components/Trace.js';
import { clubBySlug, type BrowserLeague } from '../data/league.js';
import { int } from '../format.js';

export function ResultScreen({
  league,
  result,
  asPlayed,
  withoutCall,
  you,
  hasCall,
  onBack,
}: {
  readonly league: BrowserLeague;
  readonly result: MatchResult;
  readonly asPlayed: MatchInput;
  readonly withoutCall: MatchInput;
  readonly you: Side;
  readonly hasCall: boolean;
  readonly onBack: () => void;
}) {
  const t = useT();
  const home = clubBySlug(league, asPlayed.home.club.slug);
  const away = clubBySlug(league, asPlayed.away.club.slug);

  return (
    <div className="grid gap-6">
      <section className="panel">
        <p className="label m-0 mb-2">{t('result.fullTime')}</p>
        {/*
          One row per side, each carrying its own score.
          Not a matter of taste. `2-1` written as a single isolated run reverses against the club
          names when `dir` flips, so the same markup showed 1-0 to the home side in English and 0-1
          in Arabic — the score attached to the wrong club, confidently. Pairing a name with its own
          number inside one element makes that impossible in either direction.
        */}
        {(
          [
            [home.shortName, result.homeScore, you === 'home'],
            [away.shortName, result.awayScore, you === 'away'],
          ] as const
        ).map(([name, score, mine]) => (
          <div key={name} className={mine ? 'row row-mine' : 'row'}>
            <span className="flex-1 text-h2 font-semibold">{name}</span>
            {mine && <span className="label">{t('result.you')}</span>}
            <span className="num text-scoreline font-semibold">{int(score)}</span>
          </div>
        ))}
      </section>

      <Stats result={result} you={you} />
      <Trace trace={result.trace} you={you} />
      <Counterfactual asPlayed={asPlayed} withoutCall={withoutCall} you={you} hasCall={hasCall} />

      <section className="panel">
        <p className="label m-0 mb-2">{t('result.seed')}</p>
        <p className="tech text-small break-all m-0">{result.seed}</p>
        <p className="text-small text-ink-soft mt-3 mb-0">{t('result.seed.why')}</p>
      </section>

      <button type="button" className="button-quiet" onClick={onBack}>
        {t('result.record')}
      </button>
    </div>
  );
}
