import { useState } from 'react';
import {
  counterfactual,
  type CounterfactualResult,
  type MatchInput,
  type Side,
} from '@dakka/engine';
import { useT } from '../i18n/context.js';
import { dec, withSpread } from '../format.js';

/**
 * What your one call was actually worth.
 *
 * Both arms share a seed stem, so run `i` of each is the same match up to the moment the decision
 * differs. The paired difference is therefore the decision rather than the spread of football, which
 * is what lets a few hundred replays say something a few thousand independent ones could not.
 *
 * Note the argument order. The engine's runner reports *variant minus baseline*, so the arm without
 * the call is passed as `baseline` and the match as played as `variant`: the sign then reads the way
 * a player expects — positive means the call earned points. Both arms carry the same seed string, so
 * run 0 is still the match that actually happened.
 *
 * `significant: false` is printed as plainly as `true`. "Too close to call" is the honest answer to
 * most single decisions, and a product that only ever reports findings is manufacturing them.
 */
const REPLAYS = 200;

export function Counterfactual({
  asPlayed,
  withoutCall,
  you,
  hasCall,
}: {
  readonly asPlayed: MatchInput;
  readonly withoutCall: MatchInput;
  readonly you: Side;
  readonly hasCall: boolean;
}) {
  const t = useT();
  const [result, setResult] = useState<CounterfactualResult | null>(null);
  const [running, setRunning] = useState(false);

  if (!hasCall) {
    return (
      <section className="panel">
        <h2 className="text-h2 font-semibold m-0 mb-3">{t('cf.title')}</h2>
        <p className="text-small text-ink-soft m-0">{t('cf.none')}</p>
      </section>
    );
  }

  const run = () => {
    setRunning(true);
    // Deliberately synchronous after a paint: this is a few hundred deterministic simulations, and
    // a spinner that outlives the work would be a skeleton loader by another name.
    requestAnimationFrame(() => {
      setResult(
        counterfactual({ baseline: withoutCall, variant: asPlayed, side: you, runs: REPLAYS }),
      );
      setRunning(false);
    });
  };

  return (
    <section className="panel">
      <h2 className="text-h2 font-semibold m-0 mb-3">{t('cf.title')}</h2>
      <p className="text-small text-ink-soft">{t('cf.why')}</p>

      {result === null ? (
        <button type="button" className="button-quiet mt-2" disabled={running} onClick={run}>
          {t(running ? 'cf.running' : 'cf.run')}
        </button>
      ) : (
        <>
          <p className="label mt-4 mb-2">{t('cf.runs', { n: result.runs })}</p>
          <ul className="list-none p-0 m-0">
            {(
              [
                ['cf.points', result.points],
                ['cf.goalsFor', result.goalsFor],
                ['cf.goalsAgainst', result.goalsAgainst],
              ] as const
            ).map(([label, measured]) => (
              <li key={label} className="row">
                <span className="flex-1">{t(label)}</span>
                <span className="num">{withSpread(measured.mean, measured.standardError, 2)}</span>
                <span className="text-small w-8 text-center text-faint">{t('cf.perMatch')}</span>
              </li>
            ))}
          </ul>
          <p
            className={`text-small mt-3 ${result.points.significant ? 'text-red' : 'text-ink-soft'}`}
          >
            {t(result.points.significant ? 'cf.significant' : 'cf.notSignificant')}
          </p>
          <p className="text-small text-ink-soft">{t('cf.spread')}</p>
          {/* `seq` isolates the whole before→after expression. Isolating each number on its own
              is not enough: the *order* of the three parts still reverses in Arabic, and the arrow
              then points from the new value back to the old one. */}
          <p className="label mt-2">
            <span className="seq">
              <span className="num">{dec(result.baseline.points, 2)}</span>
              {' → '}
              <span className="num">{dec(result.variant.points, 2)}</span>
            </span>
          </p>
        </>
      )}
    </section>
  );
}
