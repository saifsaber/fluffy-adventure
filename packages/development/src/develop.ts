import {
  ATTRIBUTE_GROUP,
  ALL_ATTRIBUTES,
  ROLE_DEMANDS,
  attribute,
  type AttributeName,
  type Player,
  type PlayerAttributes,
  type PlayerRole,
} from '@dakka/engine';

/**
 * How a player gets better, and how it can be explained afterwards.
 *
 * The box names the failure precisely: *a random walk with a plausible curve*. So there is **no
 * randomness here at all** — not seeded, not anywhere. A player's season moves his attributes by an
 * amount that is a function of two things that actually happened to him, and every change comes
 * back with both of them attached and their arithmetic showing. Run it twice on the same season and
 * you get the same answer, which is not a nice property so much as the whole claim: *his finishing
 * went 62 to 64* is only worth printing if the next question — *why?* — has an answer.
 *
 * **The two causes, and there are only two.**
 *
 * 1. **Ageing.** What happens to him whether he plays or not, and it is not one curve. A
 *    footballer's legs and his head keep different calendars: pace and acceleration are gone by the
 *    mid-thirties while composure and decisions are still rising. Four groups, four curves, each
 *    from what the game actually looks like rather than from one number that happened to fit.
 * 2. **Use.** The attributes his season *asked of him* sharpen, in proportion to the minutes he
 *    spent being asked. Which attributes those are is not a new table — it is `ROLE_DEMANDS`,
 *    already in the engine because role fit reads it. A season of `ball_winner` improves tackling
 *    and anticipation because that is what a ball-winner is judged on, and it improves finishing by
 *    nothing at all, because nobody asked him to finish.
 *
 * Neither is a rate anybody can tune per player. What varies between two players of the same age is
 * **what they were asked to do and how often they got on the pitch**, which is the manager's doing
 * — and that is the only way a development system is a game rather than a slot machine.
 */

/** A spell in the side: the job he was doing, and how long he did it for. */
export interface Appearance {
  readonly role: PlayerRole;
  readonly minutes: number;
}

/** The two things that move an attribute. Named to match the database's `attribute_source`. */
export type Cause = 'ageing' | 'match';

export interface Contribution {
  readonly cause: Cause;
  /** Signed, in rating points, before rounding. */
  readonly amount: number;
}

export interface AttributeChange {
  readonly attribute: AttributeName;
  readonly from: number;
  readonly to: number;
  /** Every contribution that produced it. A change is never one unexplained number. */
  readonly because: readonly Contribution[];
}

export interface Development {
  /** The player as he is after every season handed in, with his age advanced by that many years. */
  readonly player: Player;
  /** Only the attributes that actually moved, in the order `ALL_ATTRIBUTES` declares. */
  readonly changes: readonly AttributeChange[];
  /** What those seasons were, so every number above can be checked against them. */
  readonly played: {
    readonly seasons: number;
    readonly minutes: number;
    /** Seasons' worth of football, so 1 is one full season played across however many were given. */
    readonly share: number;
  };
}

/* --------------------------------------------------------------------------------------------
 * The curves
 * ------------------------------------------------------------------------------------------ */

/**
 * What a year does to each kind of attribute, in rating points per season.
 *
 * `Record<keyof PlayerAttributes, …>` so a fifth group of attributes could not be added without
 * somebody deciding how it ages. The shape of each row is the same: rising until `peakFrom`, flat
 * across the peak, falling after `peakTo`.
 *
 * The numbers are football's, not a fit: legs peak first and go first — pace is the classic
 * mid-twenties attribute and is visibly gone by the mid-thirties. Technique peaks later and holds:
 * a thirty-four-year-old still strikes a ball. The head never declines at all, which is why old
 * players read the game better than they ever did, and it is also the honest reason a veteran is
 * worth having. Keeping is the latest of the lot — goalkeepers play into their forties.
 */
export interface AgeCurve {
  readonly peakFrom: number;
  readonly peakTo: number;
  /** Points a year gained below `peakFrom`, per year of distance from it. */
  readonly rise: number;
  /** Points a year lost above `peakTo`, per year of distance from it. */
  readonly fall: number;
}

export const AGE_CURVES: Record<keyof PlayerAttributes, AgeCurve> = {
  physical: { peakFrom: 23, peakTo: 27, rise: 0.18, fall: 0.34 },
  technical: { peakFrom: 25, peakTo: 32, rise: 0.16, fall: 0.14 },
  mental: { peakFrom: 30, peakTo: 99, rise: 0.12, fall: 0 },
  goalkeeping: { peakFrom: 27, peakTo: 35, rise: 0.18, fall: 0.2 },
};

/** Signed points a season of simply being this age is worth to this kind of attribute. */
export function ageDrift(age: number, group: keyof PlayerAttributes): number {
  const curve = AGE_CURVES[group];
  if (age < curve.peakFrom) return (curve.peakFrom - age) * curve.rise;
  if (age > curve.peakTo) return -(age - curve.peakTo) * curve.fall;
  return 0;
}

/**
 * What a full season of being asked for an attribute is worth.
 *
 * One number, chosen against a measurement rather than a feeling. Growing up gives a player a
 * general lift; **what he was asked to do is what makes him good at something**, so this has to be
 * the larger term for a regular or the box's claim is decoration. The first version had it at 1.1
 * against much steeper age curves, and six seasons turned a nineteen-year-old into the same player
 * whether he spent them as a box-to-box or as a poacher — 49.5 against 49.6 overall, with the role
 * showing as a point or two. At 2.2, with the rises cut to match, the same six seasons give:
 *
 * ```
 *                      stamina  workRate  passing  tackling | finishing  anticipation  positioning
 * as a box_to_box         52       56        54       58    |    36          49            47
 * as a poacher            45       49        47       52    |    45          56            55
 * ```
 *
 * Two different footballers, at the same overall — which is the whole idea. `acceleration` comes
 * out 53 either way, because both roles are judged on it, and that is the model reading
 * `ROLE_DEMANDS` rather than a story about midfielders.
 */
export const FULL_SEASON_GAIN = 2.2;

/**
 * How much of a young player's natural growth survives a season he does not play.
 *
 * Not nothing — he trains, and he is still growing. Not all of it either, which is the whole point
 * of the box: *what varies between two players of the same age is what they were asked to do and
 * how often they got on the pitch*. Measured on the real league, the first version applied the age
 * curve regardless and a nineteen-year-old who never left the bench gained a full point of overall
 * a season — which made the manager's biggest decision about a young player worth almost nothing.
 *
 * **Decline is not conditioned on anything.** A thirty-four-year-old's legs go whether he plays or
 * not, and a model that let a manager preserve a veteran by resting him would be inventing a lever
 * football does not have.
 */
export const GROWTH_WITHOUT_FOOTBALL = 0.35;

/** 1 at the floor of the scale, 0 at the ceiling: the room a rise still has to move into. */
const headroom = (value: number): number => (99 - value) / 98;
/** The mirror, so a decline slows as a player approaches the bottom rather than falling through it. */
const floorroom = (value: number): number => (value - 1) / 98;

/* --------------------------------------------------------------------------------------------
 * A season
 * ------------------------------------------------------------------------------------------ */

const clamp = (value: number): number => Math.max(1, Math.min(99, value));

/**
 * A career's development so far, with its reasons.
 *
 * **It takes every season, not the last one, and that is not a convenience.** Attributes are whole
 * numbers — the scale is 1–99 and the database stores a `smallint` — so rounding each season on its
 * own throws the remainder away every year. Measured on the real league, that bug was silent and
 * total: a nineteen-year-old who did not play gained about a quarter of a point a season, rounded
 * to nothing, and so stood still **forever**. Summing the causes across his whole career and
 * rounding once cannot lose anything, and it makes the history the thing that is true rather than
 * a log written beside it — the same rule the league table lives under.
 *
 * Which means `develop(player, seasons.slice(0, k))` is *him after k seasons*, exactly, and the
 * difference between two prefixes is what a season did. Nothing has to be stored to ask that.
 *
 * `fullSeasonMinutes` comes from the competition rather than from a constant here — a league is
 * data, and how much football a season is differs between them.
 */
export function develop(
  player: Player,
  seasons: readonly (readonly Appearance[])[],
  fullSeasonMinutes: number,
): Development {
  const perSeason = fullSeasonMinutes <= 0 ? 1 : fullSeasonMinutes;

  // Every season's contribution, kept unrounded, with the age he was when he played it.
  const ageingByGroup = new Map<keyof PlayerAttributes, number>();
  const askedFor = new Map<AttributeName, number>();
  let minutes = 0;

  seasons.forEach((appearances, index) => {
    const age = player.age + index;
    const played = appearances.reduce((total, spell) => total + Math.max(0, spell.minutes), 0);
    const share = Math.min(1, played / perSeason);
    minutes += played;

    for (const group of ['technical', 'physical', 'mental', 'goalkeeping'] as const) {
      const drift = ageDrift(age, group);
      // Growth needs football; decline needs nothing. A manager cannot preserve a veteran by
      // resting him, and that is deliberate — football does not have that lever.
      const scaled =
        drift >= 0
          ? drift * (GROWTH_WITHOUT_FOOTBALL + (1 - GROWTH_WITHOUT_FOOTBALL) * share)
          : drift;
      ageingByGroup.set(group, (ageingByGroup.get(group) ?? 0) + scaled);
    }

    for (const spell of appearances) {
      const spellMinutes = Math.max(0, spell.minutes);
      if (spellMinutes === 0) continue;
      for (const name of ROLE_DEMANDS[spell.role]) {
        askedFor.set(name, (askedFor.get(name) ?? 0) + spellMinutes);
      }
    }
  });

  const changes: AttributeChange[] = [];
  const next: Record<string, Record<string, number>> = {
    technical: { ...player.attributes.technical },
    physical: { ...player.attributes.physical },
    mental: { ...player.attributes.mental },
    ...(player.attributes.goalkeeping === undefined
      ? {}
      : { goalkeeping: { ...player.attributes.goalkeeping } }),
  };

  for (const name of ALL_ATTRIBUTES) {
    const group = ATTRIBUTE_GROUP[name];
    // A player without goalkeeping attributes has none to develop.
    if (next[group] === undefined) continue;
    const from = attribute(player.attributes, name);

    const drift = ageingByGroup.get(group) ?? 0;
    const ageing = drift >= 0 ? drift * headroom(from) : drift * floorroom(from);
    const match = FULL_SEASON_GAIN * ((askedFor.get(name) ?? 0) / perSeason) * headroom(from);

    const because: Contribution[] = [];
    if (ageing !== 0) because.push({ cause: 'ageing', amount: ageing });
    if (match !== 0) because.push({ cause: 'match', amount: match });

    const to = clamp(Math.round(from + ageing + match));
    if (to === from || because.length === 0) continue;

    (next[group] as Record<string, number>)[name] = to;
    changes.push({ attribute: name, from, to, because });
  }

  return {
    player: {
      ...player,
      age: player.age + seasons.length,
      attributes: next as unknown as PlayerAttributes,
    },
    changes,
    played: { seasons: seasons.length, minutes, share: minutes / perSeason },
  };
}
