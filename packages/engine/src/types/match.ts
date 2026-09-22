import type { Club } from './club.js';
import type { ClubId, CompetitionId, MatchId, PlayerId } from './ids.js';
import type { PlayerCondition } from './player.js';
import type { InMatchDecision, Tactics } from './tactics.js';
import type { TouchlineManager } from '../touchline.js';
import type { MatchTrace } from './trace.js';

export interface MatchSide {
  readonly club: Club;
  readonly tactics: Tactics;
  /** Decisions the manager makes during the match, ordered by minute. */
  readonly decisions: readonly InMatchDecision[];
  /**
   * A manager on the touchline, asked once a minute and answering through the same
   * `InMatchDecision` union a human answers through.
   *
   * A function rather than data, on purpose: it is a **capability**, and capabilities never cross
   * the wire. A client sends the choices it is entitled to make and the server attaches the
   * opponent's manager from its own copy — the same rule that keeps a client from fielding an
   * eleven it invented.
   */
  readonly manager?: TouchlineManager;
}

export interface MatchContext {
  readonly competitionId: CompetitionId;
  /** Kilometres the away side travelled. Lower-league travel is a real fatigue input. */
  readonly awayTravelKm: number;
  readonly attendance: number;
  /** True when both clubs share a region — crowd and aggression effects differ. */
  readonly isDerby: boolean;
}

/**
 * Everything the engine needs. Note what is absent: no clock, no environment, no I/O.
 * `simulate(input)` is a pure function of this object, and `seed` is the only source of chance.
 */
export interface MatchInput {
  readonly id: MatchId;
  readonly seed: string;
  readonly home: MatchSide;
  readonly away: MatchSide;
  readonly context: MatchContext;
}

export type ShotOutcome = 'goal' | 'saved' | 'blocked' | 'off_target' | 'woodwork';
export type BodyPart = 'right_foot' | 'left_foot' | 'head' | 'other';
export type ShotSituation = 'open_play' | 'counter' | 'set_piece' | 'penalty' | 'rebound';

/**
 * A shot as it happened. `xg` is derived from this context — distance, angle, pressure, body part,
 * situation — and is never reverse-engineered from the outcome.
 */
export interface Shot {
  readonly minute: number;
  readonly side: 'home' | 'away';
  readonly shooter: PlayerId;
  readonly assist?: PlayerId;
  /** Metres from the centre of the goal line. */
  readonly distanceM: number;
  /** Degrees of goal visible to the shooter, 0–90. */
  readonly angleDeg: number;
  /** 0–100. How closely the shooter was closed down at the moment of contact. */
  readonly pressure: number;
  readonly bodyPart: BodyPart;
  readonly situation: ShotSituation;
  readonly xg: number;
  readonly outcome: ShotOutcome;
}

export type MatchEvent =
  | {
      readonly kind: 'goal';
      readonly minute: number;
      readonly side: 'home' | 'away';
      readonly scorer: PlayerId;
      readonly assist?: PlayerId;
    }
  | {
      readonly kind: 'card';
      readonly minute: number;
      readonly side: 'home' | 'away';
      readonly player: PlayerId;
      readonly colour: 'yellow' | 'red';
    }
  | {
      readonly kind: 'substitution';
      readonly minute: number;
      readonly side: 'home' | 'away';
      readonly off: PlayerId;
      readonly on: PlayerId;
    }
  | {
      readonly kind: 'injury';
      readonly minute: number;
      readonly side: 'home' | 'away';
      readonly player: PlayerId;
      readonly daysOut: number;
    }
  | {
      readonly kind: 'chance';
      readonly minute: number;
      readonly side: 'home' | 'away';
      readonly shot: Shot;
    };

/**
 * Counters, incremented as events occur.
 *
 * Read `.claude/skills/dakka-engine-rules/SKILL.md` §3 before adding a field here. If a number in
 * this interface can be produced any way other than `+= 1` at the moment the thing happened, it
 * does not belong. The competitor computes `shots = max(shots, goals + random())`; that is the one
 * pattern this product exists to be better than.
 */
export interface SideStats {
  readonly shots: number;
  readonly shotsOnTarget: number;
  readonly blocked: number;
  readonly corners: number;
  readonly fouls: number;
  readonly yellowCards: number;
  readonly redCards: number;
  /** Sum of every shot's xg. Derived, never assigned. */
  readonly xg: number;
  /** Ticks of possession, counted. Percentage is computed at render time from both sides. */
  readonly possessionTicks: number;

  /**
   * Not measured yet — and **absent is not zero**.
   *
   * Nothing in the engine simulates individual passes or an offside line, so there is no moment at
   * which either counter could honestly be incremented. Leaving them optional makes "we did not
   * measure this" a different value from "this happened zero times", which is the whole difference
   * between an empty stats row and a fabricated one. A UI must render them as absent, never as 0.
   *
   * They become required the day something counts them. Until then the compiler will not let anyone
   * read one without handling the undefined.
   */
  readonly passesCompleted?: number;
  readonly passesAttempted?: number;
  readonly offsides?: number;
}

export interface PlayerMatchOutcome {
  readonly playerId: PlayerId;
  readonly minutesPlayed: number;
  readonly goals: number;
  /** 1–10, derived from contributions actually recorded during the match. */
  readonly rating: number;
  readonly conditionAfter: PlayerCondition;
  /**
   * Not measured yet, for the same reason as `SideStats.passesCompleted`: the chain models a phase
   * of play rather than the pass that set up the shot, so there is nobody to credit. Absent, not 0.
   */
  readonly assists?: number;
}

export interface MatchResult {
  readonly id: MatchId;
  readonly seed: string;
  readonly homeClubId: ClubId;
  readonly awayClubId: ClubId;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly events: readonly MatchEvent[];
  readonly shots: readonly Shot[];
  readonly stats: { readonly home: SideStats; readonly away: SideStats };
  readonly players: readonly PlayerMatchOutcome[];
  readonly trace: MatchTrace;
  /** The engine version that produced this result, so a stored match can be re-simulated safely. */
  readonly engineVersion: string;
}
