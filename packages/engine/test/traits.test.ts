import { describe, expect, it } from 'vitest';
import {
  ALL_TRAITS,
  NO_TRAITS,
  TRAIT_REGISTRY,
  createRng,
  simulate,
  traitEffect,
  type MatchInput,
  type Player,
  type PlayerTrait,
  type Rng,
  type Shot,
  simulateChain,
} from '../src/index.js';
import { makeMatchInput, makeSide } from './fixtures.js';

/**
 * Traits: the axis that is easiest in the whole engine to fake.
 *
 * The fake version is a list of adjectives that resolve to `+3 finishing`, so the tests that carry
 * this file are the ones that make that impossible. **Every trait must declare a cost**, checked
 * against the registry rather than argued about. **No trait may change how many random numbers are
 * drawn**, or the same seed stops meaning the same match and every feature built on determinism
 * goes with it. And each one has to show up in the match as the thing it says it is — counted over
 * a run, never asserted from the table it was written in.
 */

const TRAITS = ALL_TRAITS;

/** Anything that makes this player worse at what the chain is about to do with him. */
const costsOf = (trait: PlayerTrait): readonly string[] => {
  const meta = TRAIT_REGISTRY[trait];
  return [
    meta.aerial > 1 ? 'meets more of it with his head' : undefined,
    meta.effort > 1 ? 'spends more doing it' : undefined,
    meta.shooterWeight.centre < 1 ? 'fewer of the central chances are his' : undefined,
    meta.shooterWeight.flank < 1 ? 'fewer of the wide chances are his' : undefined,
  ].filter((entry): entry is string => entry !== undefined);
};

describe('the registry is the model', () => {
  it('covers every trait, and nothing else', () => {
    expect([...TRAITS].sort()).toEqual(Object.keys(TRAIT_REGISTRY).sort());
    expect(TRAITS.length).toBeGreaterThan(0);
  });

  it('refuses a trait that is all upside', () => {
    // The mechanical form of the rule. A trait whose declared effects are entirely favourable is a
    // bonus with a nicer name, and this is the test that stops one being added by accident.
    for (const trait of TRAITS) {
      expect(costsOf(trait), `${trait} declares no cost`).not.toHaveLength(0);
    }
  });

  it('makes every trait do something', () => {
    for (const trait of TRAITS) {
      const meta = TRAIT_REGISTRY[trait];
      const inert =
        meta.aerial === 1 &&
        meta.effort === 1 &&
        meta.shooterWeight.centre === 1 &&
        meta.shooterWeight.flank === 1;
      expect(inert, `${trait} changes nothing`).toBe(false);
    }
  });

  it('says in words what each one pays and what it costs', () => {
    for (const trait of TRAITS) {
      expect(TRAIT_REGISTRY[trait].pays.length, trait).toBeGreaterThan(10);
      expect(TRAIT_REGISTRY[trait].costs.length, trait).toBeGreaterThan(10);
    }
  });
});

describe('composition leaves a player with no traits exactly where he was', () => {
  it('is neutral on an empty list', () => {
    // All but a fifth of the league has no trait at all, so this is the property the rest of the
    // engine rests on: adding the axis moved nobody who does not carry one.
    expect(traitEffect([])).toEqual(NO_TRAITS);
    expect(NO_TRAITS).toEqual({
      shooterWeight: { centre: 1, flank: 1 },
      aerial: 1,
      effort: 1,
    });
  });

  it('multiplies every effect, so two traits compose rather than override', () => {
    const both = traitEffect(['gets_into_the_box', 'attacks_the_cross']);
    const a = TRAIT_REGISTRY.gets_into_the_box;
    const b = TRAIT_REGISTRY.attacks_the_cross;
    expect(both.shooterWeight.centre).toBeCloseTo(
      a.shooterWeight.centre * b.shooterWeight.centre,
      12,
    );
    expect(both.shooterWeight.flank).toBeCloseTo(a.shooterWeight.flank * b.shooterWeight.flank, 12);
    expect(both.aerial).toBeCloseTo(a.aerial * b.aerial, 12);
    expect(both.effort).toBeCloseTo(a.effort * b.effort, 12);
  });

  it('does not care what order they were written in', () => {
    expect(traitEffect(['runs_the_channels', 'attacks_the_cross'])).toEqual(
      traitEffect(['attacks_the_cross', 'runs_the_channels']),
    );
  });
});

/* ------------------------------------------------------------------------------------------ */

/**
 * An `Rng` that answers exactly like the real one and counts every draw, forks included.
 *
 * Following the forks is the whole point: `simulateChain` immediately forks, so a wrapper that only
 * counted its own draws would report zero and pass no matter what the engine did.
 */
function counting(seed: string): Rng & { readonly draws: () => number } {
  let draws = 0;
  const wrap = (inner: Rng): Rng & { readonly draws: () => number } => ({
    next: () => {
      draws += 1;
      return inner.next();
    },
    int: (min: number, max: number) => {
      draws += 1;
      return inner.int(min, max);
    },
    pick: <T>(values: readonly [T, ...T[]]) => {
      draws += 1;
      return inner.pick(values);
    },
    bool: (chance?: number) => {
      draws += 1;
      return inner.bool(chance);
    },
    fork: (label: string) => wrap(inner.fork(label)),
    draws: () => draws,
  });
  return wrap(createRng(seed));
}

/** The home side's central striker, and nobody else. */
const THE_MAN = 'home-9';

/**
 * The same fixture with the named traits given to exactly one player.
 *
 * One, on purpose. The weights are a share of a draw the chain already makes, so giving a trait to
 * all three forwards mostly redistributes between them and the effect disappears into its own
 * denominator — which is how the first version of these tests measured almost nothing.
 */
function withTraits(input: MatchInput, traits: readonly PlayerTrait[]): MatchInput {
  const give = (player: Player): Player =>
    player.slug === THE_MAN ? { ...player, traits } : player;
  return {
    ...input,
    home: { ...input.home, club: { ...input.home.club, squad: input.home.club.squad.map(give) } },
  };
}

const idOf = (input: MatchInput): string =>
  String(input.home.club.squad.find((player) => player.slug === THE_MAN)?.id);

/** Every shot he took across a run of seeds, and how many the side took in total. */
function shotsBy(
  input: MatchInput,
  traits: readonly PlayerTrait[],
  runs: number,
): { readonly his: readonly Shot[]; readonly side: number } {
  const him = idOf(input);
  const his: Shot[] = [];
  let side = 0;
  for (let i = 0; i < runs; i++) {
    const played = simulate({ ...withTraits(input, traits), seed: `traits-${i}` });
    for (const shot of played.shots) {
      if (shot.side !== 'home') continue;
      side += 1;
      if (String(shot.shooter) === him) his.push(shot);
    }
  }
  return { his, side };
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

describe('determinism survives the axis', () => {
  it('draws exactly as many random numbers with traits as without', () => {
    // Rule 3, and the reason every effect is a weight on a value the chain already computes. A
    // trait that added one draw would silently re-seed everything after it, and "same seed, same
    // match" — the property counterfactual replay, the daily challenge and honest PvP all rest on
    // — would be quietly false.
    const input = makeMatchInput('draw-count');
    const chain = (match: MatchInput, rng: Rng & { readonly draws: () => number }): number => {
      simulateChain(
        {
          home: { ...makeSide(match.home.club, match.home.tactics), decisions: [] },
          away: { ...makeSide(match.away.club, match.away.tactics), decisions: [] },
          minutes: 90,
          awayTravelKm: match.context.awayTravelKm,
          isDerby: match.context.isDerby,
        },
        rng,
      );
      return rng.draws();
    };
    const plain = counting('draw-count');
    const traited = counting('draw-count');
    const before = chain(input, plain);
    const after = chain(withTraits(input, ['gets_into_the_box', 'attacks_the_cross']), traited);
    expect(after).toBe(before);
    expect(before).toBeGreaterThan(1000);
  });

  it('replays byte for byte', () => {
    const input = withTraits(makeMatchInput('replay'), ['runs_the_channels']);
    expect(simulate(input)).toEqual(simulate(input));
  });
});

describe('each trait shows up in the match as the thing it says it is', () => {
  const input = makeMatchInput();
  const RUNS = 150;
  const plain = shotsBy(input, [], RUNS);

  it('is one player, and the side around him is unchanged in kind', () => {
    // The premise. He has to be taking a real share of the shots for any of this to be measurable.
    expect(plain.his.length).toBeGreaterThan(80);
    expect(plain.side).toBeGreaterThan(plain.his.length * 3);
  });

  it('gets into the box: fewer chances, and every one of them a better one', () => {
    // Centre up, flank down. The pay is the *quality* of what falls to him — the weights take from
    // his team-mates rather than conjuring a shot, and the middle is where the better chances are.
    const traited = shotsBy(input, ['gets_into_the_box'], RUNS);
    expect(mean(traited.his.map((shot) => shot.xg))).toBeGreaterThan(
      mean(plain.his.map((shot) => shot.xg)),
    );
  });

  it('runs the channels: more of them are his, and they are worth less each', () => {
    const traited = shotsBy(input, ['runs_the_channels'], RUNS);
    expect(traited.his.length).toBeGreaterThan(plain.his.length);
    expect(mean(traited.his.map((shot) => shot.xg))).toBeLessThan(
      mean(plain.his.map((shot) => shot.xg)),
    );
  });

  it('attacks the cross: far more of them are headers, and headers are worth less', () => {
    const traited = shotsBy(input, ['attacks_the_cross'], RUNS);
    const share = (shots: readonly Shot[]): number =>
      shots.filter((shot) => shot.bodyPart === 'head').length / shots.length;

    // Measured against `runs_the_channels`, not against a player with no traits. Both pull him out
    // to the flank by the same 1.45, and the wide channels are where the ball already arrives in
    // the air — so comparing with a plain player would credit the *weights* with the headers and
    // pass with the aerial hook deleted. The two traits differ in the hook being tested and hardly
    // anywhere else, which is the only comparison that isolates it.
    const wide = shotsBy(input, ['runs_the_channels'], RUNS);
    expect(TRAIT_REGISTRY.attacks_the_cross.shooterWeight.flank).toBe(
      TRAIT_REGISTRY.runs_the_channels.shooterWeight.flank,
    );
    expect(share(traited.his)).toBeGreaterThan(share(wide.his) * 1.4);

    const headers = traited.his.filter((shot) => shot.bodyPart === 'head');
    const feet = traited.his.filter((shot) => shot.bodyPart !== 'head');
    expect(headers.length).toBeGreaterThan(15);
    expect(mean(headers.map((shot) => shot.xg))).toBeLessThan(mean(feet.map((shot) => shot.xg)));
  });

  it('the running is work: the man who does it has less left at the whistle', () => {
    const him = idOf(input);
    const left = (traits: readonly PlayerTrait[]): number => {
      let total = 0;
      for (let i = 0; i < 20; i++) {
        const played = simulate({ ...withTraits(input, traits), seed: `fitness-${i}` });
        total +=
          played.players.find((outcome) => String(outcome.playerId) === him)?.conditionAfter
            .fitness ?? 0;
      }
      return total / 20;
    };
    // `runs_the_channels` declares an effort cost; `attacks_the_cross` declares none.
    expect(left(['runs_the_channels'])).toBeLessThan(left([]));
    expect(TRAIT_REGISTRY.attacks_the_cross.effort).toBe(1);
  });
});
