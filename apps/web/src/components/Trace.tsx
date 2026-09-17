import type { MatchTrace, Side } from '@dakka/engine';
import { CAUSE_LABEL } from '../i18n/index.js';
import { useLocale } from '../i18n/context.js';
import { int, signed } from '../format.js';

/**
 * Where the match turned.
 *
 * Every moment here was emitted by the engine with its own `deltaWinProbability`, computed from the
 * engine's state at that minute. The screen names the cause from a closed table and prints the
 * number beside it — never an adjective on its own, because the number is the evidence and the
 * phrase is only the reading of it.
 *
 * An empty trace says so. A quiet match is a real result, and padding it would be the same lie as a
 * fabricated statistic wearing a different costume.
 */
export function Trace({ trace, you }: { readonly trace: MatchTrace; readonly you: Side }) {
  const { locale, t } = useLocale();

  if (trace.swings.length === 0) {
    return (
      <section className="sheet">
        <h2 className="text-h2 font-semibold m-0 mb-3">{t('trace.title')}</h2>
        <p className="text-small text-ink-soft m-0">{t('trace.empty')}</p>
      </section>
    );
  }

  return (
    <section className="sheet">
      <h2 className="text-h2 font-semibold m-0 mb-4">{t('trace.title')}</h2>
      <ol className="list-none p-0 m-0">
        {trace.swings.map((swing, i) => {
          // `deltaWinProbability` is signed for the home side; the player is not always home.
          const yours = you === 'home' ? swing.deltaWinProbability : -swing.deltaWinProbability;
          return (
            <li key={`${swing.minute}-${i}`} className="row items-start">
              <span className="minute">{int(swing.minute)}</span>
              <span className="flex-1">
                <span className="block">{CAUSE_LABEL[swing.cause][locale]}</span>
                {/* The number is its own element rather than a value substituted into the
                    sentence. Interpolated, `+0.42` inside Arabic prose renders as `0.42+` — the
                    sign detaches and lands on the wrong end. */}
                <span className="text-small text-ink-soft">
                  {t('trace.swing')} <span className="num">{signed(yours, 2)}</span>{' '}
                  {t(yours >= 0 ? 'trace.favoured.you' : 'trace.favoured.them')}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
