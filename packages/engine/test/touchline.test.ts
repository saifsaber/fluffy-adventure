import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TOUCHLINE,
  baselineManager,
  neutralise,
  plusMgr,
  createRng,
  simulate,
  simulateChain,
  type InMatchDecision,
  type MatchInput,
  type TouchlineView,
} from '../src/index.js';
import { makeClub, makeMatchInput, makeSide } from './fixtures.js';

/**
 * The opponent's manager, and the one thing the box says about him: *an opponent that cheats is the
 * fastest way to lose the product's whole claim.*
 *
 * So the tests that carry this file are not about whether he makes good decisions. They are about
 * whether he is playing the same game: that he reads a `TouchlineView` and nothing else, that he
 * decides through the same union a human decides through, that he is a pure function of what he was
 * shown, and that the counterfactual can take him away and price what he did — which is only
 * possible because there is no second path for a machine's decisions to travel down.
 */

const SOURCE = readFileSync(join(import.meta.dirname, '..', 'src', 'touchline.ts'), 'utf8');
/** The file with its prose removed, so a comment saying "no `Rng`" cannot satisfy a scan for one. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const view = (over: Partial<TouchlineView> = {}): TouchlineView => {
  const club = makeClub('them', 55);
  const eleven = club.squad.slice(0, 11);
  return {
    side: 'away',
    minute: 70,
    minutes: 90,
    score: { for: 0, against: 1 },
    tactics: {
      formation: '4-4-2',
      startingXI: eleven.map((player, index) => ({
        playerId: player.id,
        position: index === 0 ? 'GK' : 'CM',
        role: index === 0 ? 'shot_stopper' : 'box_to_box',
      })),
      bench: [],
      captain: eleven[0]?.id ?? club.squad[0]!.id,
      mentality: 'balanced',
      lineHeight: 'normal',
      pressingIntensity: 'moderate',
      pressingTrigger: 'middle_third',
      tempo: 'balanced',
      passingDirectness: 'mixed',
      width: 'balanced',
      compactness: 'balanced',
      setPieceTakers: {
        corners: eleven[10]?.id ?? club.squad[0]!.id,
        freeKicks: eleven[10]?.id ?? club.squad[0]!.id,
        penalties: eleven[10]?.id ?? club.squad[0]!.id,
      },
    },
    onField: eleven.map((player, index) => ({
      playerId: player.id,
      position: index === 0 ? 'GK' : 'CM',
      role: index === 0 ? 'shot_stopper' : 'box_to_box',
      fitness: 90,
      booked: false,
    })),
    bench: [],
    substitutionsUsed: 0,
    opponent: {
      formation: '4-3-3',
      mentality: 'balanced',
      lineHeight: 'normal',
      width: 'balanced',
      compactness: 'balanced',
      pressingIntensity: 'moderate',
    },
    ...over,
  };
};

describe('he can only see what a man on a touchline can see', () => {
  it('is handed a view that carries no space map, no probability and no seed', () => {
    // The anti-cheat, read off the type rather than promised in a comment. A manager who could see
    // the resolver would be playing a different game from the one being priced against him.
    const declaration = CODE.slice(
      CODE.indexOf('export interface TouchlineView'),
      CODE.indexOf('export type TouchlineManager'),
    );
    for (const forbidden of ['SpaceMap', 'Rng', 'shotsPerMinute', 'xg', 'momentum']) {
      expect(declaration.includes(forbidden), `the view exposes ${forbidden}`).toBe(false);
    }
    // And what he *can* see is the scoreboard, the clock and his own players.
    for (const allowed of ['score', 'minute', 'onField', 'bench', 'opponent']) {
      expect(declaration, allowed).toContain(allowed);
    }
  });

  it('is given the other side’s shape but never their condition', () => {
    // A high line is visible from thirty yards. How tired their left-back is, is not.
    const opponent = CODE.slice(
      CODE.indexOf('readonly opponent: {'),
      CODE.indexOf('export type TouchlineManager'),
    );
    expect(opponent).toContain('formation');
    expect(opponent).toContain('lineHeight');
    expect(opponent.includes('fitness'), 'he can see how tired they are').toBe(false);
    expect(opponent.includes('onField'), 'he can see their eleven').toBe(false);
  });

  it('takes no randomness, so the same view is always the same decision', () => {
    const asked = view();
    expect(baselineManager(asked)).toEqual(baselineManager(asked));
    // Scanned with the prose stripped, so the paragraph above that promises there is no `Rng`
    // cannot be what satisfies the test that there is no `Rng`.
    expect(/\bMath\s*\.\s*random\b/.test(CODE)).toBe(false);
    expect(/\bRng\b/.test(CODE)).toBe(false);
    expect(CODE.includes('TouchlineView'), 'the scan found no code at all').toBe(true);
  });
});

describe('he decides the way a human decides', () => {
  const kinds = (decisions: readonly InMatchDecision[]): readonly string[] =>
    decisions.map((decision) => decision.kind);

  it('chases a game he is losing, and not before the hour', () => {
    expect(kinds(baselineManager(view({ minute: 40 })))).toEqual([]);
    expect(kinds(baselineManager(view({ minute: TOUCHLINE.chaseFrom })))).toEqual(['mentality']);
    const pushed = baselineManager(view({ minute: 70 }))[0];
    expect(pushed?.kind === 'mentality' && pushed.to).toBe('attacking');
  });

  it('sees out a game he is winning, and not before that', () => {
    const ahead = { score: { for: 2, against: 1 } };
    expect(kinds(baselineManager(view({ ...ahead, minute: 70 })))).toEqual([]);
    const sat = baselineManager(view({ ...ahead, minute: TOUCHLINE.protectFrom }))[0];
    expect(sat?.kind === 'mentality' && sat.to).toBe('defensive');
  });

  it('asks for nothing when he has already done it', () => {
    // He reads the shape he is *currently* playing, which is why he can be asked every minute of a
    // match without stacking the same instruction ninety times.
    const already = view({ tactics: { ...view().tactics, mentality: 'ultra_attacking' } });
    expect(kinds(baselineManager(already))).toEqual([]);
  });

  it('never touches the defensive line, and the harness is the reason', () => {
    // Measured over fifty seasons: substitutions alone read 0.904 on the xG↔goals correlation and
    // mentality alone 0.904; adding the line took it to 0.883 and goals a match past their own
    // ceiling. Delaying it to the seventy-fifth minute changed nothing, so it is the mechanism and
    // not the size. A human may still make the decision — it is priced by the counterfactual.
    for (const minute of [60, 70, 80, 89]) {
      for (const score of [
        { for: 0, against: 2 },
        { for: 2, against: 0 },
      ]) {
        expect(kinds(baselineManager(view({ minute, score })))).not.toContain('line_height');
      }
    }
  });

  it('brings on a fresh man for one who is finished, and stops at three', () => {
    const club = makeClub('them', 55);
    const spent = view({
      onField: view().onField.map((man, index) =>
        index === 5 ? { ...man, fitness: TOUCHLINE.spentBelow - 1 } : man,
      ),
      bench: club.squad.slice(0, 3),
    });
    const change = baselineManager(spent).find((decision) => decision.kind === 'substitution');
    expect(change?.kind === 'substitution' && change.off).toBe(spent.onField[5]?.playerId);

    expect(
      kinds(baselineManager({ ...spent, substitutionsUsed: TOUCHLINE.maxSubstitutions })),
    ).not.toContain('substitution');
  });

  it('takes off a booked man late in a tight game, and leaves him on in a rout', () => {
    const club = makeClub('them', 55);
    const booked = (score: { for: number; against: number }): TouchlineView =>
      view({
        minute: TOUCHLINE.bookedOffFrom,
        score,
        onField: view().onField.map((man, index) => (index === 4 ? { ...man, booked: true } : man)),
        bench: club.squad.slice(0, 3),
      });
    expect(kinds(baselineManager(booked({ for: 1, against: 1 })))).toContain('substitution');
    expect(kinds(baselineManager(booked({ for: 0, against: 4 })))).not.toContain('substitution');
  });

  it('has nobody to bring on when the bench is empty', () => {
    const spent = view({
      onField: view().onField.map((man, index) => (index === 5 ? { ...man, fitness: 10 } : man)),
      bench: [],
    });
    expect(kinds(baselineManager(spent))).not.toContain('substitution');
  });
});

describe('the match, with a man on the other touchline', () => {
  const managed = (input: MatchInput): MatchInput => ({
    ...input,
    away: { ...input.away, manager: baselineManager },
  });

  it('changes the match, and leaves it byte-identical on replay', () => {
    const base = makeMatchInput('touchline');
    const alone = simulate(base);
    const against = simulate(managed(base));
    expect(against).toEqual(simulate(managed(base)));
    // He has to actually do something, or none of the rest of this means anything.
    expect(JSON.stringify(against.events)).not.toBe(JSON.stringify(alone.events));
  });

  it('leaves a match with no manager exactly as it was', () => {
    // Every existing match in this codebase has no manager attached, so this is the assertion that
    // the axis moved nobody who does not have one.
    const base = makeMatchInput('untouched');
    expect(simulate(base)).toEqual(simulate({ ...base, away: { ...base.away } }));
  });

  it('puts his decisions on the chain’s record the way a human’s go on it', () => {
    // Read off the chain rather than off `MatchResult`, because `MatchEvent` has no
    // `tactical_change` kind at all — a shape change, by anybody, is invisible in a finished
    // result. That is a real gap and it is recorded as one; what this asserts is what the box asked
    // for, which is that a machine's decision travels the same path and is recorded by the same
    // code as a human's.
    //
    // The resolver is supplied on purpose: the chain learns a score **only** from it, so a bare
    // chain is nil-nil forever and a manager reacting to the scoreboard has nothing to react to.
    // Here the home side's first shot goes in and nothing else does, so the away man is a goal down
    // and has to come out.
    const base = makeMatchInput('recorded');
    let scored = false;
    const chain = simulateChain(
      {
        home: { ...makeSide(base.home.club, base.home.tactics), decisions: [] },
        away: {
          ...makeSide(base.away.club, base.away.tactics),
          decisions: [],
          manager: baselineManager,
        },
        minutes: 90,
        resolve: (shot) => {
          if (shot.side === 'home' && !scored) {
            scored = true;
            return 'goal';
          }
          return 'off_target';
        },
      },
      createRng('recorded'),
    );

    const his = chain.events.filter(
      (event) => event.kind === 'tactical_change' && event.side === 'away',
    );
    expect(his.length).toBeGreaterThan(0);
    expect(
      his.every((event) => event.kind === 'tactical_change' && event.what === 'mentality'),
    ).toBe(true);
    // And he waited for the hour, exactly as the rule says.
    expect(Math.min(...his.map((event) => event.minute))).toBeGreaterThanOrEqual(
      TOUCHLINE.chaseFrom,
    );
    // The side that was never behind never changed anything.
    expect(chain.events.filter((e) => e.kind === 'tactical_change' && e.side === 'home')).toEqual(
      [],
    );
  });

  it('does not get stuck behind a decision the player queued for later', () => {
    // The queue is ordered by minute and `applyDecisions` stops at the first entry still in the
    // future. A manager's answer appended to the end of it would therefore sit behind a call the
    // player set for the eighty-fifth minute and never reach the pitch at the sixtieth — silently,
    // because the match would simply look like one where he did nothing.
    const base = makeMatchInput('queued');
    let scored = false;
    const chain = simulateChain(
      {
        home: { ...makeSide(base.home.club, base.home.tactics), decisions: [] },
        away: {
          ...makeSide(base.away.club, base.away.tactics),
          decisions: [{ kind: 'pressing', minute: 85, to: 'high' }],
          manager: baselineManager,
        },
        minutes: 90,
        resolve: (shot) => {
          if (shot.side === 'home' && !scored) {
            scored = true;
            return 'goal';
          }
          return 'off_target';
        },
      },
      createRng('queued'),
    );

    const his = chain.events.filter(
      (event) =>
        event.kind === 'tactical_change' && event.side === 'away' && event.what === 'mentality',
    );
    expect(his.length).toBeGreaterThan(0);
    expect(Math.min(...his.map((event) => event.minute))).toBeLessThan(85);
    // And the player's own call still lands, at the minute he asked for it.
    const hers = chain.events.filter(
      (event) =>
        event.kind === 'tactical_change' && event.side === 'away' && event.what === 'pressing',
    );
    expect(hers.map((event) => event.minute)).toEqual([85]);
  });

  it('finds the job already done when he is asked again', () => {
    // The chain asks him once a minute, and that guard is a bound on **work**, not on correctness:
    // what makes repeated asking safe is that every rule names an absolute target and compares it
    // with the shape he is currently playing. The first version stepped one rung from wherever he
    // was, so asking twice walked him to `ultra_attacking` — a rule whose strength depended on how
    // often it was asked. This test is what caught that, and it is why deleting the once-a-minute
    // guard now changes nothing at all.
    const chasing = view({ score: { for: 0, against: 1 }, minute: 70 });
    const first = baselineManager(chasing);
    expect(first).toEqual([{ kind: 'mentality', minute: 70, to: 'attacking' }]);

    const after = view({ ...chasing, tactics: { ...chasing.tactics, mentality: 'attacking' } });
    expect(baselineManager(after)).toEqual([]);
    // And he does not drag a side that was already going for it back down to his own target.
    const bolder = view({
      ...chasing,
      tactics: { ...chasing.tactics, mentality: 'ultra_attacking' },
    });
    expect(baselineManager(bolder)).toEqual([]);
  });

  it('has nothing to react to when the chain never learns a score', () => {
    // Worth saying out loud: the chain knows a score only through its resolver, so a manager
    // dropped into a bare chain is a man watching a nil-nil that never changes. Not a bug — the
    // boundary that keeps a shot from being shaped by its own outcome — but it is the reason he
    // must be tested through a resolver rather than beside one.
    const base = makeMatchInput('silent');
    const chain = simulateChain(
      {
        home: { ...makeSide(base.home.club, base.home.tactics), decisions: [] },
        away: {
          ...makeSide(base.away.club, base.away.tactics),
          decisions: [],
          manager: baselineManager,
        },
        minutes: 90,
      },
      createRng('silent'),
    );
    expect(chain.events.filter((event) => event.kind === 'tactical_change')).toEqual([]);
  });
});

describe('the counterfactual can take him away', () => {
  it('prices an opponent manager the way it prices a human’s decisions', () => {
    // The box's second requirement. `neutralise` is what +MGR runs to build its control arm, and if
    // it could not remove a machine manager the control would still be managed — which would make
    // every "your decisions were worth this" a comparison against something that was never a
    // baseline at all.
    const base = makeMatchInput('priced');
    const withMan: MatchInput = { ...base, away: { ...base.away, manager: baselineManager } };
    const without = neutralise(withMan, 'away');
    expect(without.away.manager).toBeUndefined();
    expect(without.away.decisions).toEqual([]);
    expect(simulate(without)).toEqual(simulate(neutralise(base, 'away')));
  });

  it('still measures a human against a baseline that has no manager of its own', () => {
    const base = makeMatchInput('mgr');
    const withMan: MatchInput = { ...base, home: { ...base.home, manager: baselineManager } };
    const measured = plusMgr([{ input: withMan, side: 'home' }]);
    expect(Number.isFinite(measured.points)).toBe(true);
  });
});
