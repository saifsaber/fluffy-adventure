// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Engine from '@dakka/engine';

/**
 * How much engine work each click costs — counted, not timed.
 *
 * The 2026-09-26 performance pass found one interaction five times slower than the rest, and found
 * that 95% of it was the engine simulating the round's other nine fixtures. **That work cannot be
 * removed**: those nine matches are what makes the league table something that happened rather than
 * something a random number generator wrote down, which is the claim this whole product is built
 * to make. So there is nothing here to optimise, and this file does not try to.
 *
 * What it does is pin the *shape* of the work, so a regression has to announce itself. Counting is
 * deliberate and a timing assertion would be wrong twice over: it would be flaky on a shared
 * machine, and a millisecond in jsdom is not a millisecond in a browser. A count is the same number
 * everywhere. If a stray re-render ever simulates the round twice, the slowest interaction in the
 * product silently doubles, and today nothing at all would notice.
 */

const simulated = { calls: 0 };

vi.mock('@dakka/engine', async () => {
  const actual = await vi.importActual<typeof Engine>('@dakka/engine');
  return {
    ...actual,
    simulate: (input: Parameters<typeof actual.simulate>[0]) => {
      simulated.calls += 1;
      return actual.simulate(input);
    },
  };
});

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { DATA_ROOT, loadLeague } = await import('@dakka/content');
const { App } = await import('../src/App.js');
const { LocaleProvider } = await import('../src/i18n/context.js');
const league = loadLeague(DATA_ROOT, 'egy-d4');

/** The engine calls one click costs. */
function costOf(name: string): number {
  const before = simulated.calls;
  fireEvent.click(screen.getByRole('button', { name }));
  return simulated.calls - before;
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  simulated.calls = 0;
  render(
    <LocaleProvider initial="en">
      <App league={league as never} />
    </LocaleProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Take the job' }));
});

describe('the engine is asked for exactly the matches that are played', () => {
  it('charges each click what that click actually decides', () => {
    // Read this as the performance profile it is. Nine of the ten matches in a round land on one
    // click, which is why that click is the slow one, and why it is the only one worth watching.
    expect({
      'set up': costOf('Set up the match'),
      play: costOf('Play the match'),
      'skip to full time': costOf('Take me to full time'),
      record: costOf('Record it and carry on'),
    }).toEqual({
      // Building the two arms of the counterfactual is not simulating them: the setup screen
      // assembles both and runs neither, so choosing tactics costs nothing.
      'set up': 0,
      // The manager's own match, once.
      play: 1,
      // The match is already decided; the replay is a reading of a result that exists.
      'skip to full time': 0,
      // The other nine fixtures in the round, each a real match.
      record: 9,
    });
  });

  it('plays a twenty-club round in ten matches and not one more', () => {
    const round = ['Set up the match', 'Play the match', 'Take me to full time'].reduce(
      (sum, name) => sum + costOf(name),
      0,
    );
    expect(round + costOf('Record it and carry on')).toBe(league.clubs.length / 2);
  });

  it('asks for nothing at all when the manager is only looking', () => {
    // The dashboard is derived from results that already exist. A tile that simulated something to
    // draw itself would make looking at the league cost as much as playing in it.
    expect(simulated.calls).toBe(0);
    expect(screen.getByRole('button', { name: 'Set up the match' })).toBeTruthy();
    expect(simulated.calls).toBe(0);
  });
});
