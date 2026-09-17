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
      <section className="sheet">
        <p className="label m-0 mb-2">{t('result.fullTime')}</p>
        <div className="flex items-center gap-4">
          <span className="flex-1 text-h2 font-semibold">{home.shortName}</span>
          <span className="num text-display font-semibold">
            {int(result.homeScore)}-{int(result.awayScore)}
          </span>
          <span className="flex-1 text-h2 font-semibold text-end">{away.shortName}</span>
        </div>
        <p className="label mt-3 mb-0">
          {you === 'home' ? home.shortName : away.shortName} · {t('result.you')}
        </p>
      </section>

      <Stats result={result} you={you} />
      <Trace trace={result.trace} you={you} />
      <Counterfactual asPlayed={asPlayed} withoutCall={withoutCall} you={you} hasCall={hasCall} />

      <section className="sheet">
        <p className="label m-0 mb-2">{t('result.seed')}</p>
        <p className="tech text-small break-all m-0">{result.seed}</p>
        <p className="text-small text-ink-soft mt-3 mb-0">{t('result.seed.why')}</p>
      </section>

      <button type="button" className="button" onClick={onBack}>
        {t('result.back')}
      </button>
    </div>
  );
}
