import { describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import {
  baselineTactics,
  competitionId,
  matchId,
  simulate,
  type MatchInput,
  type Personality,
  type Player,
} from '@dakka/engine';
import {
  ALL_PERSONALITIES,
  MORALE_FOR,
  PERSONALITY_REGISTRY,
  applyEffects,
  isPraise,
  moraleFor,
  parseEffects,
  type EffectKind,
} from '../src/index.js';
import { player as makePlayer } from './fixtures.js';

/**
 * Personality, and the one condition the box put on it: it reaches the dressing room and stops.
 *
 * The tests that carry this file are the boundary and the free lunch. **The boundary** is checked
 * from the outside as well as the inside — `packages/engine/test/purity.test.ts` proves the engine
 * never reads the field, and the test here proves the consequence: the same match, played by the
 * same eleven, comes out byte for byte identical whatever sort of men they are. **The free lunch**
 * is the failure this axis invites — a character note that quietly makes a player better to manage
 * on every count — and the registry is checked for one rather than trusted not to have it.
 */

const PERSONALITIES = ALL_PERSONALITIES;
const KINDS = Object.keys(MORALE_FOR) as readonly EffectKind[];

const batch = (raw: unknown) => {
  const parsed = parseEffects(raw);
  if (!parsed.ok) throw new Error(parsed.problems.join('; '));
  return parsed.batch;
};

describe('the registry is the model', () => {
  it('covers every personality, and nothing else', () => {
    expect([...PERSONALITIES].sort()).toEqual(Object.keys(PERSONALITY_REGISTRY).sort());
  });

  it('refuses a man who is simply easier to manage than everybody else', () => {
    // Praise reaching him harder *and* criticism reaching him less is not a character, it is a
    // bonus with a character note attached. What is allowed is the real trade: hard to lift and
    // hard to break, or easy to lift and easy to lose.
    for (const personality of PERSONALITIES) {
      const { toPraise, toCriticism } = PERSONALITY_REGISTRY[personality];
      const freeLunch = toPraise >= 1 && toCriticism <= 1 && (toPraise > 1 || toCriticism < 1);
      expect(freeLunch, `${personality} is strictly easier to manage`).toBe(false);
    }
  });

  it('makes every personality change something', () => {
    for (const personality of PERSONALITIES) {
      const { toPraise, toCriticism } = PERSONALITY_REGISTRY[personality];
      expect(toPraise === 1 && toCriticism === 1, `${personality} is inert`).toBe(false);
    }
  });

  it('says in words who each one is', () => {
    for (const personality of PERSONALITIES) {
      expect(PERSONALITY_REGISTRY[personality].is.length, personality).toBeGreaterThan(20);
    }
  });
});

describe('what a thing said is worth to him', () => {
  it('is exactly what it is worth to anybody, for a man with no personality', () => {
    // Two thirds of the league. If this drifted, adding the axis would have moved everybody.
    for (const kind of KINDS) expect(moraleFor(kind, undefined), kind).toBe(MORALE_FOR[kind]);
  });

  it('routes praise and criticism to the right multiplier', () => {
    expect(isPraise('player_backed')).toBe(true);
    expect(isPraise('squad_praised')).toBe(true);
    expect(isPraise('player_criticised')).toBe(false);
    expect(isPraise('squad_criticised')).toBe(false);

    // `volatile` is 1.5 both ways, so it separates the two sides of the table by construction.
    expect(moraleFor('player_backed', 'volatile')).toBeGreaterThan(MORALE_FOR.player_backed);
    expect(moraleFor('player_criticised', 'volatile')).toBeLessThan(MORALE_FOR.player_criticised);
  });

  it('keeps silence worth nothing to everybody', () => {
    for (const personality of [...PERSONALITIES, undefined]) {
      expect(moraleFor('nothing_said', personality), String(personality)).toBe(0);
    }
  });

  it('never rounds a man who was reached down to nothing', () => {
    // A slight that moves nobody is a slight the player cannot trace, and morale is shown whole.
    for (const personality of PERSONALITIES) {
      for (const kind of KINDS) {
        if (MORALE_FOR[kind] === 0) continue;
        expect(
          Math.abs(moraleFor(kind, personality)),
          `${personality}/${kind}`,
        ).toBeGreaterThanOrEqual(1);
        // And it never flips the direction of what was said.
        expect(Math.sign(moraleFor(kind, personality))).toBe(Math.sign(MORALE_FOR[kind]));
      }
    }
  });

  it('reads the two sides of a man separately, where they differ', () => {
    // `steady` and `volatile` are symmetric by design, so neither can tell the two multipliers
    // apart — a version that applied `toPraise` to everything would look identical on both. `proud`
    // is the one that separates them, and this is the assertion that makes the split observable.
    const proud = PERSONALITY_REGISTRY.proud;
    expect(proud.toPraise).not.toBe(proud.toCriticism);
    expect(moraleFor('player_backed', 'proud')).toBe(
      Math.round(MORALE_FOR.player_backed * proud.toPraise),
    );
    expect(moraleFor('player_criticised', 'proud')).toBe(
      -Math.round(-MORALE_FOR.player_criticised * proud.toCriticism),
    );
    // Said plainly: praise is worth less to him than to anybody, and criticism costs him more.
    expect(moraleFor('player_backed', 'proud')).toBeLessThan(MORALE_FOR.player_backed);
    expect(moraleFor('player_criticised', 'proud')).toBeLessThan(MORALE_FOR.player_criticised);
  });

  it('has no thing said small enough for the floor to be doing any work yet', () => {
    // `moraleFor` floors the magnitude at one so a man who was reached always moves. On today's
    // table nothing scales below one, so that floor is a guard for when `MORALE_FOR` is fitted
    // rather than a live rounding — recorded here because an untestable branch should be one
    // somebody deliberately left, and this test starts failing the moment it becomes live.
    for (const kind of KINDS) {
      for (const personality of PERSONALITIES) {
        const { toPraise, toCriticism } = PERSONALITY_REGISTRY[personality];
        const scaled = Math.abs(MORALE_FOR[kind] * (isPraise(kind) ? toPraise : toCriticism));
        expect(scaled === 0 || scaled >= 1, `${kind}/${personality} reaches the floor`).toBe(true);
      }
    }
  });

  it('takes the steady man less far in both directions than the volatile one', () => {
    expect(moraleFor('player_backed', 'steady')).toBeLessThan(
      moraleFor('player_backed', 'volatile'),
    );
    expect(moraleFor('player_criticised', 'steady')).toBeGreaterThan(
      moraleFor('player_criticised', 'volatile'),
    );
  });
});

describe('the dressing room', () => {
  const squad = (personalities: readonly (Personality | undefined)[]): readonly Player[] =>
    personalities.map((personality, index) => {
      const man = makePlayer(`p${index}`, 60);
      return personality === undefined ? man : { ...man, personality };
    });

  it('moves two men by different amounts for the same sentence', () => {
    // The whole point, in one assertion: the manager said one thing, and it landed differently.
    const men = squad(['steady', 'volatile', undefined]);
    const { changes } = applyEffects(men, batch([{ kind: 'squad_criticised' }]));
    expect(changes).toHaveLength(3);
    const worthTo = (index: number): number => {
      const found = changes.find((change) => String(change.playerId) === String(men[index]?.id));
      if (found === undefined) throw new Error(`nobody moved at ${index}`);
      return found.worth;
    };
    // Criticism: the volatile man takes it hardest, the steady man least, the ordinary one between.
    expect(worthTo(1)).toBeLessThan(worthTo(2));
    expect(worthTo(2)).toBeLessThan(worthTo(0));
  });

  it('reports what it was worth to him, not only where he ended up', () => {
    // A morale figure whose cause cannot be reached is the one thing this product refuses, and
    // after personality the new number alone no longer says what happened.
    const men = squad(['volatile']);
    const { changes, squad: after } = applyEffects(
      men,
      batch([{ kind: 'player_backed', playerId: String(men[0]?.id) }]),
    );
    const change = changes[0];
    expect(change?.because).toBe('player_backed');
    expect(change?.worth).toBe(moraleFor('player_backed', 'volatile'));
    expect(change?.to).toBe((change?.from ?? 0) + (change?.worth ?? 0));
    expect(after[0]?.condition.morale).toBe(change?.to);
  });

  it('leaves a man with no personality exactly where the table says', () => {
    const men = squad([undefined]);
    const { changes } = applyEffects(
      men,
      batch([{ kind: 'player_criticised', playerId: String(men[0]?.id) }]),
    );
    expect(changes[0]?.worth).toBe(MORALE_FOR.player_criticised);
  });
});

describe('it reaches the dressing room and stops there', () => {
  it('cannot change a match', () => {
    // The consequence of the dependency graph, asserted from the outside. `Personality` is declared
    // in the engine and its meanings live here, in a package the engine cannot import — so the same
    // eleven play the same match whatever sort of men they are, byte for byte. Real squads, because
    // the claim is about the engine reading real content rather than about a fixture.
    const league = loadLeague(DATA_ROOT, 'egy-d4');
    const [home, away] = league.clubs;
    if (home === undefined || away === undefined) throw new Error('the league needs two clubs');

    const played = (personality: Personality | undefined): MatchInput['home'] => ({
      club: {
        ...home,
        squad: home.squad.map((man): Player => {
          // Rebuilt without the field rather than set to `undefined`: `exactOptionalPropertyTypes`
          // is on, and absent and present-but-undefined are genuinely different here.
          const rest = { ...man };
          delete (rest as { personality?: Personality }).personality;
          return personality === undefined ? rest : { ...rest, personality };
        }),
      },
      tactics: baselineTactics(home.squad),
      decisions: [],
    });

    const play = (side: MatchInput['home']) =>
      simulate({
        id: matchId('personality'),
        seed: 'personality',
        home: side,
        away: { club: away, tactics: baselineTactics(away.squad), decisions: [] },
        context: {
          competitionId: competitionId(league.league.slug),
          awayTravelKm: 80,
          attendance: 1000,
          isDerby: false,
        },
      });

    const plain = play(played(undefined));
    for (const personality of PERSONALITIES) {
      expect(play(played(personality)), personality).toEqual(plain);
    }
    // And the premise: the league really does ship men with personalities, so "no difference" is a
    // measurement rather than an artefact of nobody having one.
    expect(
      league.clubs.flatMap((club) => club.squad).filter((man) => man.personality !== undefined)
        .length,
    ).toBeGreaterThan(50);
  });
});
