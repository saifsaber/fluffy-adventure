import { useMemo, useState } from 'react';
import { simulate, type MatchResult } from '@dakka/engine';
import { LocaleSwitcher } from './components/LocaleSwitcher.js';
import { Masthead } from './components/Masthead.js';
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
              onPlay={() => setPlayed(simulate(asPlayed))}
            />
          ) : (
            <ResultScreen
              league={league}
              result={played}
              asPlayed={asPlayed}
              withoutCall={withoutCall}
              you={yourSide(setup)}
              hasCall={setup.call !== null}
              onBack={() => setPlayed(null)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
