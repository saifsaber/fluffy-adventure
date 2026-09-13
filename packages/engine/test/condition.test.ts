import { describe, expect, it } from 'vitest';
import {
  createRng,
  indexSquad,
  drainPerTick,
  foulChance,
  simulateChain,
  tacticalPresence,
  gridTotal,
  travelBurden,
  type ChainEvent,
  type ChainResult,
  type Intensity,
  type PlayerId,
} from '../src/index.js';
import { makeClub, makePlayer, makeSide, patchClub } from './fixtures.js';
import type { ChainSide, InMatchDecision, Player } from '../src/index.js';

/**
 * 3f is the box that makes 3c **live**.
 *
 * Before it, the two space maps were resolved once at kick-off and never again, which meant a
 * substitution changed nothing, a sending-off changed nothing, and ninety minutes of running changed
 * nothing. Every in-match decision was decoration. These tests are mostly about proving the opposite:
 * that state reaches the resolver, and that everything counted here was counted when it happened.
 */

const home = makeClub('home', 55);
const away = makeClub('away', 55);

const play = (seed: string, over: Partial<Parameters<typeof simulateChain>[0]> = {}): ChainResult =>
  simulateChain(
    { home: makeSide(home), away: makeSide(away), minutes: 90, ...over },
    createRng(seed),
  );

const sample = (n: number, make: (i: number) => ChainResult): ChainResult[] =>
  Array.from({ length: n }, (_, i) => make(i));

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const endFitness = (result: ChainResult, side: 'home' | 'away'): number =>
  mean([...result.conditionAfter[side].values()].map((c) => c.fitness));

describe('ninety minutes costs something', () => {
  it('drains fitness by counting it down, never by assigning a total', () => {
    const result = play('drain');
    for (const [, condition] of result.conditionAfter.home) {
      expect(condition.fitness).toBeLessThan(100);
      expect(condition.fitness).toBeGreaterThan(50);
    }
    // A fresh side finishing a normal match should be tired, not broken.
    expect(endFitness(result, 'home')).toBeGreaterThan(75);
    expect(endFitness(result, 'home')).toBeLessThan(95);
  });

  it('empties a pressing side far faster than a containing one', () => {
    const hard = mean(
      sample(20, (i) =>
        play(`hard-${i}`, {
          home: makeSide(home, {
            pressingIntensity: 'gegenpress',
            tempo: 'fast',
            mentality: 'ultra_attacking',
          }),
          away: makeSide(away),
          minutes: 90,
        }),
      ).map((r) => endFitness(r, 'home')),
    );
    const easy = mean(
      sample(20, (i) =>
        play(`easy-${i}`, {
          home: makeSide(home, {
            pressingIntensity: 'contain',
            tempo: 'slow',
            mentality: 'ultra_defensive',
          }),
          away: makeSide(away),
          minutes: 90,
        }),
      ).map((r) => endFitness(r, 'home')),
    );
    // Effort is the resource a tactic cannot conjure: this is the price of pressing.
    expect(easy - hard).toBeGreaterThan(10);
  });

  it('keeps the two squads apart, so one side cannot overwrite the other', () => {
    // These fixtures share player ids on purpose. Merged into a single map, the away side's fatigue
    // silently replaced the home side's and hid the entire intensity model for one probe run.
    const shared = makeClub('shared', 55);
    const result = simulateChain(
      {
        home: makeSide(shared, { pressingIntensity: 'gegenpress', tempo: 'fast' }),
        away: makeSide(shared, { pressingIntensity: 'contain', tempo: 'slow' }),
        minutes: 90,
      },
      createRng('collide'),
    );
    expect(endFitness(result, 'home')).toBeLessThan(endFitness(result, 'away') - 8);
  });

  it('charges the away side for the coach trip', () => {
    const near = mean(
      sample(15, (i) => play(`near-${i}`, { awayTravelKm: 0 })).map((r) => endFitness(r, 'away')),
    );
    const far = mean(
      sample(15, (i) => play(`far-${i}`, { awayTravelKm: 800 })).map((r) => endFitness(r, 'away')),
    );
    expect(far).toBeLessThan(near);
  });

  it('spends less on a keeper than on a box-to-box midfielder', () => {
    const player = makePlayer('x', 'CM', 'box_to_box', 55);
    const intensity: Intensity = { pressing: 'moderate', tempo: 'balanced', mentality: 'balanced' };
    expect(drainPerTick(player, 'box_to_box', intensity, 0)).toBeGreaterThan(
      drainPerTick(player, 'shot_stopper', intensity, 0) * 2,
    );
  });

  it('lasts longer on better stamina', () => {
    const intensity: Intensity = { pressing: 'high', tempo: 'fast', mentality: 'balanced' };
    const fit = makePlayer('fit', 'CM', 'box_to_box', 55);
    const unfit = makePlayer('unfit', 'CM', 'box_to_box', 55);
    const strong = {
      ...fit,
      attributes: { ...fit.attributes, physical: { ...fit.attributes.physical, stamina: 90 } },
    };
    const weak = {
      ...unfit,
      attributes: { ...unfit.attributes, physical: { ...unfit.attributes.physical, stamina: 20 } },
    };
    expect(drainPerTick(strong, 'box_to_box', intensity, 0)).toBeLessThan(
      drainPerTick(weak, 'box_to_box', intensity, 0),
    );
  });

  it('normalises travel and refuses to go negative or run away', () => {
    expect(travelBurden(0)).toBe(0);
    expect(travelBurden(-100)).toBe(0);
    expect(travelBurden(400)).toBeCloseTo(0.5, 9);
    expect(travelBurden(50_000)).toBe(1);
  });
});

describe('fouls and cards', () => {
  const results = sample(200, (i) => play(`cards-${i}`));
  const per = (pick: (r: ChainResult) => number): number => mean(results.map(pick));

  it('books people at about the rate football does', () => {
    // Real league football: roughly 22 fouls, 3.5 yellows and 0.2 reds across both sides.
    expect(per((r) => r.home.fouls + r.away.fouls)).toBeGreaterThan(16);
    expect(per((r) => r.home.fouls + r.away.fouls)).toBeLessThan(28);
    expect(per((r) => r.home.yellowCards + r.away.yellowCards)).toBeGreaterThan(2);
    expect(per((r) => r.home.yellowCards + r.away.yellowCards)).toBeLessThan(5);
    expect(per((r) => r.home.redCards + r.away.redCards)).toBeLessThan(0.45);
  });

  it('counts every card it recorded as an event', () => {
    for (const result of results.slice(0, 40)) {
      for (const side of ['home', 'away'] as const) {
        const cards = result.events.filter(
          (e): e is Extract<ChainEvent, { kind: 'card' }> => e.kind === 'card' && e.side === side,
        );
        expect(result[side].yellowCards).toBe(cards.filter((c) => c.colour === 'yellow').length);
        expect(result[side].redCards).toBe(cards.filter((c) => c.colour === 'red').length);
        expect(result[side].fouls).toBe(
          result.events.filter((e) => e.kind === 'foul' && e.side === side).length,
        );
      }
    }
  });

  it('never books the same player three times, because the second one sends him off', () => {
    for (const result of results) {
      const seen = new Map<PlayerId, number>();
      for (const event of result.events) {
        if (event.kind !== 'card') continue;
        const key = `${event.side}:${event.player}` as PlayerId;
        const count = (seen.get(key) ?? 0) + 1;
        seen.set(key, count);
        expect(count, `${key} was carded ${count} times`).toBeLessThanOrEqual(2);
        if (count === 2) expect(event.colour).toBe('red');
      }
    }
  });

  it('takes no further part once a player is sent off', () => {
    // The point of the whole box: a red card has to reach the resolver, or the side plays on with
    // eleven and the sending-off is cosmetic.
    const withRed = results.find((r) =>
      r.events.some((e) => e.kind === 'card' && e.colour === 'red'),
    );
    expect(withRed, 'no sending-off in 200 matches').toBeDefined();
    for (const event of withRed!.events) {
      if (event.kind !== 'card' || event.colour !== 'red') continue;
      const later = withRed!.events.filter(
        (e) => e.minute > event.minute && 'player' in e && e.player === event.player,
      );
      expect(later).toEqual([]);
      const shotsAfter = withRed!.shots.filter(
        (s) => s.minute > event.minute && s.shooter === event.player && s.side === event.side,
      );
      expect(shotsAfter).toEqual([]);
    }
  });

  it('gives more fouls away when the side is built to press and scrap', () => {
    const nasty = mean(
      sample(25, (i) =>
        play(`nasty-${i}`, {
          home: makeSide(home),
          away: makeSide(
            patchClub(away, {
              CB: { mental: { aggression: 95 } },
              CDM: { mental: { aggression: 95 } },
            }),
            {
              pressingIntensity: 'gegenpress',
            },
          ),
          minutes: 90,
        }),
      ).map((r) => r.away.fouls),
    );
    const calm = mean(
      sample(25, (i) =>
        play(`calm-${i}`, {
          home: makeSide(home),
          away: makeSide(
            patchClub(away, {
              CB: { mental: { aggression: 15 } },
              CDM: { mental: { aggression: 15 } },
            }),
            {
              pressingIntensity: 'contain',
            },
          ),
          minutes: 90,
        }),
      ).map((r) => r.away.fouls),
    );
    expect(nasty).toBeGreaterThan(calm * 1.4);
  });

  it('rises with aggression and with pressing, independently', () => {
    expect(foulChance(90, 'moderate')).toBeGreaterThan(foulChance(20, 'moderate'));
    expect(foulChance(50, 'gegenpress')).toBeGreaterThan(foulChance(50, 'contain'));
    expect(foulChance(99, 'gegenpress')).toBeLessThan(0.6);
  });
});

describe('penalties', () => {
  const results = sample(300, (i) => play(`pens-${i}`));

  it('are awarded about as often as football awards them', () => {
    const rate = mean(results.map((r) => r.home.penaltiesAwarded + r.away.penaltiesAwarded));
    expect(rate).toBeGreaterThan(0.08);
    expect(rate).toBeLessThan(0.5);
  });

  it('come from the spot, unpressed, and are taken by the nominated taker', () => {
    const spot = results.flatMap((r) => r.shots.filter((s) => s.situation === 'penalty'));
    expect(spot.length).toBeGreaterThan(10);
    for (const shot of spot) {
      expect(shot.distanceM).toBe(11);
      expect(shot.pressure).toBe(5);
      const side = shot.side === 'home' ? home : away;
      expect(shot.shooter).toBe(makeSide(side).tactics.setPieceTakers.penalties);
    }
  });

  it('are counted once each, as awarded and as a shot', () => {
    for (const result of results.slice(0, 60)) {
      for (const side of ['home', 'away'] as const) {
        expect(result[side].penaltiesAwarded).toBe(
          result.shots.filter((s) => s.side === side && s.situation === 'penalty').length,
        );
      }
    }
  });
});

describe('momentum moves bodies, it does not create them', () => {
  it('is a conserved transfer, exactly like every other shape change', () => {
    // The guarantee 3c established, extended to the one thing 3f adds to the shape. If momentum
    // could raise a side's total presence it would be a hidden bonus for being on top.
    const level = gridTotal(tacticalPresence(makeSide(home)));
    for (const momentum of [-1.5, -0.7, 0, 0.7, 1.5, 9]) {
      const grid = tacticalPresence({ ...makeSide(home), momentum });
      expect(gridTotal(grid), `momentum ${momentum}`).toBeCloseTo(level, 9);
    }
  });

  it('pushes a side on top further forward, and a side under pressure back', () => {
    const onTop = tacticalPresence({ ...makeSide(home), momentum: 1.5 });
    const underIt = tacticalPresence({ ...makeSide(home), momentum: -1.5 });
    expect(onTop.attacking_centre).toBeGreaterThan(underIt.attacking_centre);
    expect(onTop.middle_centre).toBeLessThan(underIt.middle_centre);
  });
});

/**
 * In-match decisions.
 *
 * This is the part that was purely cosmetic before 3f: `InMatchDecision` had been a typed union
 * since Step 1, and nothing read it. A substitution that does not reach the space resolver is a line
 * in a log file, not a decision — and a game whose decisions do not change the simulation has no
 * business claiming its debriefs explain anything.
 */
describe('what the manager does mid-match', () => {
  const striker = home.squad[9] as Player;
  const fresh = makePlayer('impact-sub', 'ST', 'poacher', 80);

  const withDecisions = (decisions: readonly InMatchDecision[]): ChainSide => ({
    tactics: { ...makeSide(home).tactics, bench: [fresh.id] },
    players: indexSquad([...home.squad, fresh]),
    decisions,
  });

  const substitution = (minute: number): InMatchDecision => ({
    kind: 'substitution',
    minute,
    off: striker.id,
    on: fresh.id,
    position: 'ST',
    role: 'poacher',
  });

  it('puts the substitute on, and only after the minute asked for', () => {
    const result = simulateChain(
      { home: withDecisions([substitution(60)]), away: makeSide(away), minutes: 90 },
      createRng('sub'),
    );
    const event = result.events.find((e) => e.kind === 'substitution');
    expect(event).toBeDefined();
    expect(event?.minute).toBeGreaterThanOrEqual(60);

    for (const shot of result.shots.filter((s) => s.side === 'home')) {
      if (shot.shooter === fresh.id) expect(shot.minute).toBeGreaterThanOrEqual(60);
      if (shot.shooter === striker.id) expect(shot.minute).toBeLessThan(62);
    }
  });

  it('actually reaches the resolver — the substitute takes part', () => {
    // If the space map were still resolved once at kick-off, this player would never touch the ball.
    const touched = sample(30, (i) =>
      simulateChain(
        { home: withDecisions([substitution(46)]), away: makeSide(away), minutes: 90 },
        createRng(`impact-${i}`),
      ),
    ).flatMap((r) => r.shots.filter((s) => s.shooter === fresh.id));
    expect(touched.length).toBeGreaterThan(0);
  });

  it('refuses a substitution it cannot make, without pretending it happened', () => {
    const nonsense: readonly InMatchDecision[] = [
      // Nobody by that name is on the pitch.
      {
        kind: 'substitution',
        minute: 20,
        off: makePlayer('ghost', 'ST', 'poacher', 50).id,
        on: fresh.id,
        position: 'ST',
        role: 'poacher',
      },
      // Not in the squad at all.
      {
        kind: 'substitution',
        minute: 30,
        off: striker.id,
        on: makePlayer('stranger', 'ST', 'poacher', 50).id,
        position: 'ST',
        role: 'poacher',
      },
    ];
    const result = simulateChain(
      { home: withDecisions(nonsense), away: makeSide(away), minutes: 90 },
      createRng('nonsense'),
    );
    expect(result.events.filter((e) => e.kind === 'substitution')).toEqual([]);
  });

  it('brings a player on once and only once', () => {
    const result = simulateChain(
      {
        home: withDecisions([substitution(30), substitution(70)]),
        away: makeSide(away),
        minutes: 90,
      },
      createRng('twice'),
    );
    expect(result.events.filter((e) => e.kind === 'substitution')).toHaveLength(1);
  });

  it('applies shape changes in minute order, whatever order they arrive in', () => {
    const out: readonly InMatchDecision[] = [
      { kind: 'mentality', minute: 75, to: 'ultra_attacking' },
      { kind: 'line_height', minute: 20, to: 'deep' },
      { kind: 'pressing', minute: 50, to: 'gegenpress' },
    ];
    const result = simulateChain(
      { home: { ...makeSide(home), decisions: out }, away: makeSide(away), minutes: 90 },
      createRng('order'),
    );
    const changes = result.events.filter((e) => e.kind === 'tactical_change');
    expect(changes.map((e) => e.minute)).toEqual(
      [...changes.map((e) => e.minute)].sort((a, b) => a - b),
    );
    expect(changes).toHaveLength(3);
  });

  it('makes a late change to an all-out attack visibly change the play', () => {
    // The measurable claim: shape changes move the shape. Chasing a game from the hour mark should
    // produce more chances in the closing stages than leaving the side alone does.
    const lateShots = (decisions: readonly InMatchDecision[], label: string): number =>
      mean(
        sample(40, (i) =>
          simulateChain(
            { home: { ...makeSide(home), decisions }, away: makeSide(away), minutes: 90 },
            createRng(`${label}-${i}`),
          ),
        ).map((r) => r.shots.filter((s) => s.side === 'home' && s.minute >= 60).length),
      );
    const chasing = lateShots(
      [
        { kind: 'mentality', minute: 60, to: 'ultra_attacking' },
        { kind: 'line_height', minute: 60, to: 'very_high' },
      ],
      'chase',
    );
    const unchanged = lateShots([], 'steady');
    expect(chasing).toBeGreaterThan(unchanged);
  });

  it('stays deterministic with every kind of decision in play', () => {
    const decisions: readonly InMatchDecision[] = [
      substitution(55),
      { kind: 'mentality', minute: 60, to: 'attacking' },
      { kind: 'compactness', minute: 65, to: 'loose' },
      {
        kind: 'role_change',
        minute: 70,
        playerId: (home.squad[6] as Player).id,
        to: 'ball_winner',
      },
    ];
    const once = simulateChain(
      { home: withDecisions(decisions), away: makeSide(away), minutes: 90 },
      createRng('determinism'),
    );
    const twice = simulateChain(
      { home: withDecisions(decisions), away: makeSide(away), minutes: 90 },
      createRng('determinism'),
    );
    expect(JSON.stringify(once.possessions)).toBe(JSON.stringify(twice.possessions));
    expect(JSON.stringify(once.events)).toBe(JSON.stringify(twice.events));
  });
});
