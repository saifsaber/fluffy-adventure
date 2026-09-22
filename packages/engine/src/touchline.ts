import type { Side } from './chain.js';
import type { PlayerId } from './types/ids.js';
import type { Player, PlayerRole, Position } from './types/player.js';
import type {
  Compactness,
  InMatchDecision,
  LineHeight,
  Mentality,
  PressingIntensity,
  Tactics,
  TeamWidth,
} from './types/tactics.js';

/**
 * The opponent's manager — a man on a touchline, not a second engine.
 *
 * The box puts the danger plainly: *an opponent that cheats is the fastest way to lose the
 * product's whole claim.* A counterfactual only means anything if both arms were played under the
 * same rules, so an opposing manager who could see the space maps, the seed, or the other side's
 * fitness would make every "your decision was worth this" a comparison against something that was
 * never playing the same game.
 *
 * **So he is handed a `TouchlineView` and nothing else.** That is the anti-cheat, and it is
 * structural rather than a promise: the type is what a man standing on the line can see — the
 * clock, the score, his own eleven and what is left of them, who is booked, who is on his bench,
 * and the shape the other side is playing. It carries no space map, no probability, no opponent
 * fitness, no `Rng`. A manager cannot read what he was not given.
 *
 * **He decides through `InMatchDecision`, the same union a human decides through**, and the chain
 * applies both through the same `applyDecisions`. There is no second path and no privileged one,
 * which is what lets `neutralise()` price his decisions exactly the way it prices a human's.
 *
 * **He is a pure function.** No randomness, not even seeded: a manager who rolled a die would make
 * the counterfactual's two arms differ for a reason that is not the decision being measured. Same
 * view, same decisions, every time — and because the view is rebuilt from the live match each
 * minute, that is enough to make him adaptive without making him unpredictable.
 */

/** One of his own, as he sees him: where he is playing and how much is left of him. */
export interface OnField {
  readonly playerId: PlayerId;
  readonly position: Position;
  readonly role: PlayerRole;
  /** 0–100, live. A manager can see a man is gone. */
  readonly fitness: number;
  readonly booked: boolean;
}

/**
 * Everything a manager on the touchline can see, and deliberately nothing else.
 *
 * What is **absent** is the point: `SpaceMap`, `shotsPerMinute`, the opposition's fitness, the
 * possession count, the PRNG. He can see the other side's *shape* — a high line and three at the
 * back are visible from thirty yards — and he can see the scoreboard and his own players. That is
 * the whole of it.
 */
export interface TouchlineView {
  readonly side: Side;
  readonly minute: number;
  /** Regulation length, so "twenty minutes left" is arithmetic rather than a constant. */
  readonly minutes: number;
  readonly score: { readonly for: number; readonly against: number };
  /** His own shape as it now stands, including anything he has already changed. */
  readonly tactics: Tactics;
  readonly onField: readonly OnField[];
  /** Who is still available to bring on. */
  readonly bench: readonly Player[];
  readonly substitutionsUsed: number;
  /** What the other side is playing. Visible from the touchline; their condition is not. */
  readonly opponent: {
    readonly formation: string;
    readonly mentality: Mentality;
    readonly lineHeight: LineHeight;
    readonly width: TeamWidth;
    readonly compactness: Compactness;
    readonly pressingIntensity: PressingIntensity;
  };
}

export type TouchlineManager = (view: TouchlineView) => readonly InMatchDecision[];

/**
 * When a manager does what, as data rather than as numbers buried in a branch.
 *
 * Every one of these is a thing a commentator would say out loud — *he's gone to three up front
 * with twenty to go*, *that one's finished, he's bringing him off* — which is the test of whether a
 * rule belongs here at all. A rule nobody would say aloud is a rule nobody can argue with.
 */
export interface TouchlineRules {
  /** Not before this minute: a side a goal down on the half-hour has time to play properly. */
  readonly chaseFrom: number;
  /** Nor this one, for protecting a lead. Sitting back at 50 minutes invites the whole match. */
  readonly protectFrom: number;
  /** Below this, a man is finished and the bench is better than he is. */
  readonly spentBelow: number;
  /** A booked man in a tight game, this late, is a red card waiting to happen. */
  readonly bookedOffFrom: number;
  readonly maxSubstitutions: number;
}

export const TOUCHLINE: TouchlineRules = {
  chaseFrom: 60,
  protectFrom: 75,
  spentBelow: 55,
  bookedOffFrom: 65,
  maxSubstitutions: 3,
};

/**
 * The mentality dial in order, so "no further than attacking" is arithmetic.
 *
 * The first version stepped **one rung from wherever he was**, which read well and was wrong: he is
 * asked every minute, so a side that fell behind on the hour was at `attacking` at 60, and
 * `ultra_attacking` by 61, and stuck there. A rule that walks a dial on a timer is a rule whose
 * strength depends on how often it is asked, which is not a thing a manager does. An idempotence
 * test caught it — he is supposed to find the job already done when asked twice, and he did not.
 */
const MENTALITY_ORDER: Record<Mentality, number> = {
  ultra_defensive: 0,
  defensive: 1,
  balanced: 2,
  attacking: 3,
  ultra_attacking: 4,
};

/** Where a man chasing a game wants to be, and no further. */
const CHASING: Mentality = 'attacking';
/** And a man seeing one out. */
const PROTECTING: Mentality = 'defensive';

/** The best man on the bench for this job: band-free, because the slot already names the role. */
function replacementFor(
  view: TouchlineView,
  position: Position,
  role: PlayerRole,
): Player | undefined {
  const natural = view.bench.filter((player) => player.positions.includes(position));
  const pool = natural.length > 0 ? natural : view.bench;
  // Ties break on the bench's own order, which comes from the team sheet — declared, never random.
  let best: Player | undefined;
  for (const player of pool) {
    if (best === undefined || fitFor(player, role) > fitFor(best, role)) best = player;
  }
  return best;
}

/** How ready a bench player is for a job: his condition, and nothing the manager cannot see. */
const fitFor = (player: Player, _role: PlayerRole): number => player.condition.fitness;

/**
 * A competent, unremarkable touchline manager.
 *
 * Three rules, and each one can be wrong — which is what makes him a manager rather than an
 * advantage. Chasing a game more attacking opens the space behind that the engine already models;
 * protecting a lead invites the pressure that produces the equaliser; and the man he brings on is
 * usually worse than the man he takes off, which is the price of the fresh legs.
 *
 * **He does not touch the defensive line, and the harness is why.** Isolated over fifty seasons,
 * 19,000 matches: substitutions alone read 0.904 on the xG↔goals correlation and mentality alone
 * 0.904, both against a floor of 0.900 — free. Adding the line took it to **0.883** and pushed
 * goals a match to 2.802, past its own ceiling of 2.8. Delaying it to the seventy-fifth minute
 * changed nothing (0.883), so the mechanism is not the magnitude: moving a line up and down late in
 * a match is the single biggest thing that can be done to the *spread* of chance quality, and the
 * engine has no room for that — see the standing blocker. `line_height` remains a decision a
 * **human** can make, because a human's is priced by the counterfactual against the same opponent;
 * what is withheld is a machine making it in every match in the division.
 *
 * Every rule is written so that asking him twice in the same match changes nothing: he reads the
 * shape he is *currently* playing, so "go more attacking" fires once and then finds itself already
 * done. That is why he can be asked every minute without stacking.
 */
export function baselineManager(
  view: TouchlineView,
  rules: TouchlineRules = TOUCHLINE,
): readonly InMatchDecision[] {
  const decisions: InMatchDecision[] = [];
  const minute = view.minute;
  const margin = view.score.for - view.score.against;
  const left = view.minutes - minute;

  // 1. Chase it, or see it out.
  const now = MENTALITY_ORDER[view.tactics.mentality];
  if (margin < 0 && minute >= rules.chaseFrom && now < MENTALITY_ORDER[CHASING]) {
    decisions.push({ kind: 'mentality', minute, to: CHASING });
  } else if (margin > 0 && minute >= rules.protectFrom && now > MENTALITY_ORDER[PROTECTING]) {
    decisions.push({ kind: 'mentality', minute, to: PROTECTING });
  }

  // 2 and 3. One change of personnel a minute, so a manager never empties his bench at once.
  if (view.substitutionsUsed < rules.maxSubstitutions && left > 0) {
    const spent = view.onField.find((man) => man.fitness < rules.spentBelow);
    const atRisk =
      minute >= rules.bookedOffFrom && Math.abs(margin) <= 1
        ? view.onField.find((man) => man.booked)
        : undefined;
    const off = spent ?? atRisk;
    if (off !== undefined) {
      const on = replacementFor(view, off.position, off.role);
      if (on !== undefined) {
        decisions.push({
          kind: 'substitution',
          minute,
          off: off.playerId,
          on: on.id,
          position: off.position,
          role: off.role,
        });
      }
    }
  }

  return decisions;
}
