import { useMemo, useState } from 'react';
import { simulate, type MatchResult } from '@dakka/engine';
import { seen, type Career } from '@dakka/dashboard';
import { nextRound } from '@dakka/season';
import { LocaleSwitcher } from './components/LocaleSwitcher.js';
import { Masthead } from './components/Masthead.js';
import { DashboardScreen } from './screens/Dashboard.js';
import { MatchdayScreen } from './screens/Matchday.js';
import { ResultScreen } from './screens/Result.js';
import { SetupScreen } from './screens/Setup.js';
import { StartScreen } from './screens/Start.js';
import type { BrowserLeague } from './data/league.js';
import { OPENING_DIALS, advance, setupFor, startCareer, type Dials } from './career.js';
import { buildMatch, yourSide } from './match.js';

/**
 * The loop: take a club, look at the dashboard, set up the fixture it names, play it, record it.
 *
 * The dashboard is the landing screen because it is the only one that can say what is worth doing
 * — and it can only say that inside a career. A dashboard fed a one-off match would be reporting on
 * a season that does not exist, which is the difference between a screen and a mock-up.
 */

type Screen = 'dashboard' | 'setup' | 'matchday' | 'result';

export function App({ league }: { readonly league: BrowserLeague }) {
  const [career, setCareer] = useState<Career | null>(null);
  const [dials, setDials] = useState<Dials>(OPENING_DIALS);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [played, setPlayed] = useState<MatchResult | null>(null);

  // The fixture is the season's, not the screen's: who, where and in which round come from the
  // calendar, and only the three dials come from the manager.
  const setup = useMemo(
    () => (career === null ? undefined : setupFor(league, career, dials)),
    [league, career, dials],
  );
  const asPlayed = useMemo(
    () => (setup === undefined ? undefined : buildMatch(league, setup, true)),
    [league, setup],
  );
  const withoutCall = useMemo(
    () => (setup === undefined ? undefined : buildMatch(league, setup, false)),
    [league, setup],
  );

  function body() {
    if (career === null) {
      return (
        <StartScreen league={league} onStart={(slug) => setCareer(startCareer(league, slug))} />
      );
    }
    if (screen === 'dashboard') {
      return (
        <DashboardScreen
          league={league}
          career={career}
          onPlay={() => {
            // The visit is marked on the way out, so "what changed since I last looked" is measured
            // from what was actually on screen rather than from a clock.
            setCareer(seen(career));
            setScreen('setup');
          }}
        />
      );
    }
    if (setup === undefined || asPlayed === undefined || withoutCall === undefined) return null;
    if (screen === 'setup') {
      return (
        <SetupScreen
          league={league}
          setup={setup}
          onChange={setDials}
          onPlay={() => {
            setPlayed(simulate(asPlayed));
            setScreen('matchday');
          }}
        />
      );
    }
    if (played === null) return null;
    if (screen === 'matchday') {
      return (
        <MatchdayScreen
          league={league}
          result={played}
          asPlayed={asPlayed}
          you={yourSide(setup)}
          call={setup.call}
          onFullTime={() => setScreen('result')}
        />
      );
    }
    return (
      <ResultScreen
        league={league}
        result={played}
        asPlayed={asPlayed}
        withoutCall={withoutCall}
        you={yourSide(setup)}
        hasCall={setup.call !== null}
        onBack={() => {
          // Recording is what makes the next dashboard true: this result and the rest of the round
          // go into the season, and every tile is derived from the season.
          setCareer(advance(league, career, setup, played));
          setDials(OPENING_DIALS);
          setPlayed(null);
          setScreen('dashboard');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[960px] px-4 md:px-6 py-6">
        <div className="-mx-4 md:-mx-6 mb-6">
          <Masthead
            competition={league.league.shortName}
            round={career === null ? undefined : nextRound(career.season)[0]?.round}
            aside={<LocaleSwitcher />}
          />
        </div>
        <main>{body()}</main>
      </div>
    </div>
  );
}
