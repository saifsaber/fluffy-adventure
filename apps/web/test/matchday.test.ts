import { describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { baselineTactics, competitionId, matchId, simulate } from '@dakka/engine';
import type { Club, MatchInput } from '@dakka/engine';
import { FULL_TIME, beatsFor, pressureAt, reached, scoreAt } from '../src/matchday.js';

/**
 * The replay reads the match back. It does not play one.
 *
 * Everything here is about that distinction: the clock cannot change the score, the pressure is
 * the engine's own sample rather than a curve drawn between goals, and a minute that has not been
 * reached shows nothing rather than a guess at what is coming.
 */

const { clubs } = loadLeague(DATA_ROOT, 'egy-d4');
const [home, away] = clubs as readonly Club[];

const input: MatchInput = {
  id: matchId('replay'),
  seed: 'replay-1',
  home: { club: home!, tactics: baselineTactics(home!.squad), decisions: [] },
  away: { club: away!, tactics: baselineTactics(away!.squad), decisions: [] },
  context: {
    competitionId: competitionId('replay'),
    awayTravelKm: 120,
    attendance: 1500,
    isDerby: false,
  },
};
const result = simulate(input);

describe('the score is counted, never carried', () => {
  it('starts at nothing and ends at what the engine produced', () => {
    expect(scoreAt(result, 0)).toEqual({ home: 0, away: 0 });
    expect(scoreAt(result, FULL_TIME)).toEqual({
      home: result.homeScore,
      away: result.awayScore,
    });
  });

  it('never goes backwards as the clock runs', () => {
    let previous = scoreAt(result, 0);
    for (let minute = 1; minute <= FULL_TIME; minute++) {
      const now = scoreAt(result, minute);
      expect(now.home).toBeGreaterThanOrEqual(previous.home);
      expect(now.away).toBeGreaterThanOrEqual(previous.away);
      previous = now;
    }
  });

  it('changes exactly on the minute a goal was scored, and on no other', () => {
    // The one assertion that separates a counted scoreline from an interpolated one: the score
    // may only move where the engine recorded a goal.
    const goalMinutes = new Set(
      result.events.filter((event) => event.kind === 'goal').map((event) => event.minute),
    );
    for (let minute = 1; minute <= FULL_TIME; minute++) {
      const before = scoreAt(result, minute - 1);
      const now = scoreAt(result, minute);
      const moved = now.home !== before.home || now.away !== before.away;
      expect(moved, `minute ${minute}`).toBe(goalMinutes.has(minute));
    }
  });
});

describe('the pressure band shows a sample, not a curve', () => {
  it('reads the engine timeline, oriented to the side you manage', () => {
    for (const minute of [0, 17, 45, 89, 90]) {
      const asHome = pressureAt(result, minute, 'home');
      const asAway = pressureAt(result, minute, 'away');
      expect(asHome).toBe(result.trace.winProbabilityTimeline[minute]);
      expect((asHome ?? 0) + (asAway ?? 0)).toBeCloseTo(1, 10);
    }
  });

  it('says nothing rather than guessing past the end of the timeline', () => {
    expect(pressureAt(result, FULL_TIME + 5, 'home')).toBeUndefined();
  });
});

describe('the beats', () => {
  const call = { kind: 'mentality', minute: 60, to: 'attacking' } as const;

  it('carry every goal, every card and every swing, and nothing invented', () => {
    const beats = beatsFor(result, 'home', null);
    const goals = result.events.filter((event) => event.kind === 'goal').length;
    const cards = result.events.filter((event) => event.kind === 'card').length;
    expect(beats.filter((beat) => beat.kind === 'goal')).toHaveLength(goals);
    expect(beats.filter((beat) => beat.kind === 'card')).toHaveLength(cards);
    expect(beats.filter((beat) => beat.kind === 'swing')).toHaveLength(result.trace.swings.length);
    expect(beats).toHaveLength(goals + cards + result.trace.swings.length);
  });

  it('adds your call, and only when you made one', () => {
    expect(beatsFor(result, 'home', null).some((beat) => beat.kind === 'call')).toBe(false);
    const withCall = beatsFor(result, 'home', call);
    const made = withCall.filter((beat) => beat.kind === 'call');
    expect(made).toHaveLength(1);
    expect(made[0]?.minute).toBe(60);
  });

  it('never attributes a swing to the call', () => {
    // The engine emits no cause in the `decision` domain — measured, and recorded under Blocked.
    // So no swing on this screen may be presented as the consequence of a decision. The beats keep
    // the call and the swings as separate kinds precisely so that cannot be quietly done later.
    for (const beat of beatsFor(result, 'home', call)) {
      if (beat.kind === 'swing') expect(beat.moment.cause).toBeDefined();
      expect(Object.keys(beat)).not.toContain('causedBy');
    }
  });

  it('runs in order, with the goal read before the odds it moved', () => {
    const beats = beatsFor(result, 'home', call);
    for (let i = 1; i < beats.length; i++) {
      expect(beats[i]!.minute).toBeGreaterThanOrEqual(beats[i - 1]!.minute);
    }
    for (const goal of beats.filter((beat) => beat.kind === 'goal')) {
      const sameMinute = beats.filter((beat) => beat.minute === goal.minute);
      expect(sameMinute[0]?.kind).toBe('goal');
    }
  });

  it('signs a swing from the point of view of whoever is managing', () => {
    const asHome = beatsFor(result, 'home', null).filter((beat) => beat.kind === 'swing');
    const asAway = beatsFor(result, 'away', null).filter((beat) => beat.kind === 'swing');
    asHome.forEach((beat, index) => {
      if (beat.kind !== 'swing') return;
      const mirrored = asAway[index];
      if (mirrored?.kind !== 'swing') return;
      expect(beat.delta).toBeCloseTo(-mirrored.delta, 12);
    });
  });
});

describe('the clock only reveals, never decides', () => {
  it('shows nothing before the first beat and everything at full time', () => {
    const beats = beatsFor(result, 'home', null);
    const first = Math.min(...beats.map((beat) => beat.minute));
    expect(reached(beats, first - 1)).toHaveLength(0);
    expect(reached(beats, FULL_TIME)).toHaveLength(beats.length);
  });

  it('reveals monotonically — a beat once shown is never taken back', () => {
    const beats = beatsFor(result, 'home', null);
    let previous = 0;
    for (let minute = 0; minute <= FULL_TIME; minute++) {
      const shown = reached(beats, minute).length;
      expect(shown).toBeGreaterThanOrEqual(previous);
      previous = shown;
    }
  });

  it('puts the newest beat first, because that is the one you just watched', () => {
    const shown = reached(beatsFor(result, 'home', null), FULL_TIME);
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i]!.minute).toBeLessThanOrEqual(shown[i - 1]!.minute);
    }
  });
});
