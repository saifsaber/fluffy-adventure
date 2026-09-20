import { useMemo, useState } from 'react';
import { simulate, type MatchResult } from '@dakka/engine';
import { LocaleSwitcher } from './components/LocaleSwitcher.js';
import { Masthead } from './components/Masthead.js';
import { MatchdayScreen } from './screens/Matchday.js';
import { ResultScreen } from './screens/Result.js';
import { SetupScreen } from './screens/Setup.js';
import type { BrowserLeague } from './data/league.js';
import { buildMatch, yourSide, type Setup } from './match.js';

export function initialSetup(league: BrowserLeague): Setup {
  const [first, second] = league.clubs;
  if (first === undefined || second === undefined) throw new Error('a league needs two clubs');
  return {
    yourSlug: first.slug,
    opponentSlug: second.slug,
    venue: 'home',
    approach: 'balanced',
    line: 'normal',
    press: 'moderate',
    call: null,
  };
}

export function App({ league }: { readonly league: BrowserLeague }) {
  const [setup, setSetup] = useState<Setup>(() => initialSetup(league));
  const [played, setPlayed] = useState<MatchResult | null>(null);
  /**
   * Whether the replay has been left. Matchday reads the finished result back minute by minute;
   * the result screen is the same match with nothing withheld. The match is decided before either
   * is drawn, which is why skipping the replay is allowed to cost nothing.
   */
  const [atFullTime, setAtFullTime] = useState(false);

  const asPlayed = useMemo(() => buildMatch(league, setup, true), [league, setup]);
  const withoutCall = useMemo(() => buildMatch(league, setup, false), [league, setup]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[960px] px-4 md:px-6 py-6">
        <div className="-mx-4 md:-mx-6 mb-6">
          <Masthead competition={league.league.shortName} aside={<LocaleSwitcher />} />
        </div>

        <main>
          {played === null ? (
            <SetupScreen
              league={league}
              setup={setup}
              onChange={setSetup}
              onPlay={() => {
                setAtFullTime(false);
                setPlayed(simulate(asPlayed));
              }}
            />
          ) : !atFullTime ? (
            <MatchdayScreen
              league={league}
              result={played}
              asPlayed={asPlayed}
              you={yourSide(setup)}
              call={setup.call}
              onFullTime={() => setAtFullTime(true)}
            />
          ) : (
            <ResultScreen
              league={league}
              result={played}
              asPlayed={asPlayed}
              withoutCall={withoutCall}
              you={yourSide(setup)}
              hasCall={setup.call !== null}
              onBack={() => {
                setPlayed(null);
                setAtFullTime(false);
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
