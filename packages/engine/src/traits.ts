import type { PlayerTrait } from './types/player.js';

/**
 * Traits: the named things a player *does*, as distinct from how good he is at them.
 *
 * Attributes say how well. Roles say what he was asked to do. A trait says what he does anyway —
 * shoots the moment he sees the goal, runs the channels, attacks every cross — and it is the axis
 * that is easiest in the whole engine to fake. The fake version is a list of adjectives that
 * resolve to `+3 finishing`: a rating with a nicer name, and one more number nobody counted.
 *
 * Three rules keep this one honest, and each is a test:
 *
 * 1. **A trait changes a decision the chain already makes.** There are exactly three per-player
 *    decisions inside a possession — who takes the shot, where he takes it from, and how he meets
 *    the ball — plus what he spends doing it. Every effect below lands on one of those. A trait
 *    with nowhere to land does not get invented a place.
 * 2. **Every trait carries a cost.** The registry declares its effects as data, and a test refuses
 *    a trait whose declared effects are all favourable. That is the mechanical form of the rule —
 *    without it, "trait" is just the word for a bonus you liked the sound of.
 * 3. **No trait changes how many random numbers are drawn.** Determinism is not a property to
 *    assume: a trait that added a draw would silently re-seed every match after it, and the same
 *    seed would stop meaning the same match. The effects are all weights and biases on values the
 *    chain already computes from draws it already makes.
 *
 * **There is no hook on where a player shoots from, and the harness is why.** The first version
 * gave `shoots_on_sight` a bias on the chain's penetration skew — shots from further out — which is
 * both the right hook and, on this engine, unshippable. Isolated over 30 seasons: the weights and
 * the aerial share together cost 0.002 of the xG↔goals correlation, and the distance bias alone cost
 * **0.024**, taking a 0.905 baseline to 0.881 against a 0.900 floor. It survived shrinking to a
 * quarter of its size (0.895) because the mechanism is not the magnitude: pushing shots down the xG
 * curve makes a club's goals noisier against its own xG, and `resolveShot` adds the shooter's
 * finishing in log-odds, where a low-xG shot is exactly where that term moves the answer most. The
 * blueprint's floor is 0.900 and the engine already sits at 0.903–0.905, so there is no headroom for
 * **any** feature that widens the shot-quality distribution. That is a constraint on the engine, not
 * on traits, and it is recorded in the worklog as one.
 *
 * What is deliberately **not** here: anything a defender does. The chain resolves defending through
 * the space map rather than through a per-defender duel, so the only per-player hook on that side
 * is `pickFouler` — and a trait there could only ever add a cost, never a benefit, which would make
 * it a penalty rather than a characteristic. Recorded rather than faked; it needs a duel the model
 * does not have yet.
 */

export interface TraitMeta {
  /**
   * How much likelier this player is to be the one who takes the shot, by the channel the chance
   * came from. 1 leaves the draw exactly as it was.
   *
   * This is a **redistribution** and not a gift: the side's shots are shared out among whoever is
   * in the zone, so one player's share rising is another's falling. It pays only when the man is a
   * better finisher than whoever would otherwise have hit it, which is why the same trait makes one
   * squad sharper and another wasteful.
   */
  readonly shooterWeight: { readonly centre: number; readonly flank: number };
  /** Multiplier on the chance he meets the ball with his head. A header is worth materially less. */
  readonly aerial: number;
  /** Multiplier on what he spends per tick. Doing more costs more, and he fades sooner for it. */
  readonly effort: number;
  /** One line each, and both are required — see rule 2. */
  readonly pays: string;
  readonly costs: string;
}

const NEUTRAL = { centre: 1, flank: 1 } as const;

/**
 * Every trait, and exactly what it does.
 *
 * `Record<PlayerTrait, TraitMeta>` so a trait added to the union without a decided effect is a
 * build error — the guard `CAUSE_REGISTRY`, `ROLE_DRIFT` and `ROLE_DEMANDS` all use.
 */
export const TRAIT_REGISTRY: Record<PlayerTrait, TraitMeta> = {
  gets_into_the_box: {
    shooterWeight: { centre: 1.4, flank: 0.85 },
    aerial: 1,
    effort: 1.12,
    pays: 'more of the chances from in front of goal are his, and those are the better ones',
    costs: 'he is not the one who picks it up wide, and he empties faster for the running',
  },
  runs_the_channels: {
    shooterWeight: { centre: 0.8, flank: 1.45 },
    aerial: 1,
    effort: 1.15,
    pays: 'the ball played into the corner is his',
    costs:
      'he is out there rather than in the middle, where the better chances are, and it is work',
  },
  attacks_the_cross: {
    shooterWeight: { centre: 1.05, flank: 1.45 },
    aerial: 1.8,
    effort: 1,
    pays: 'the ball into the box finds him',
    costs: 'far more of his chances are headers, and a header is worth less than a shot',
  },
};

export const ALL_TRAITS = Object.keys(TRAIT_REGISTRY) as readonly PlayerTrait[];

/**
 * The combined effect of everything a player does, as one multiplier per decision.
 *
 * Traits compose by multiplying their weights and summing their biases, which is the only
 * composition that keeps "no traits" exactly neutral — the property the rest of the engine relies
 * on, because all but a handful of players have none.
 */
export interface TraitEffect {
  readonly shooterWeight: { readonly centre: number; readonly flank: number };
  readonly aerial: number;
  readonly effort: number;
}

export const NO_TRAITS: TraitEffect = {
  shooterWeight: NEUTRAL,
  aerial: 1,
  effort: 1,
};

export function traitEffect(traits: readonly PlayerTrait[]): TraitEffect {
  if (traits.length === 0) return NO_TRAITS;
  let centre = 1;
  let flank = 1;
  let aerial = 1;
  let effort = 1;
  for (const trait of traits) {
    const meta = TRAIT_REGISTRY[trait];
    centre *= meta.shooterWeight.centre;
    flank *= meta.shooterWeight.flank;
    aerial *= meta.aerial;
    effort *= meta.effort;
  }
  return { shooterWeight: { centre, flank }, aerial, effort };
}
