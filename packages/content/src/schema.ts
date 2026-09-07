import { z } from 'zod';

/**
 * The on-disk content schema.
 *
 * Every rule that differs between football cultures lives here as a *field*, never as a branch in
 * code. If supporting a new country would need an `if (country === ...)` anywhere, this schema is
 * missing a field. See `docs/01-product/05-global-strategy.md` §8.4.
 *
 * Error messages are written for a human contributor, because community-submitted leagues are the
 * intended expansion mechanism (§7) and a validator that says "Invalid input" is useless to them.
 */

const rating = z.number().int().min(1).max(99);

const slug = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'must be lowercase Latin letters, digits and single hyphens',
  );

/** Every named entity carries its local name and a Latin slug. Global-strategy §8.3. */
const named = z.object({
  name: z.string().min(1),
  shortName: z.string().min(1),
  slug,
});

export const positionSchema = z.enum([
  'GK',
  'RB',
  'LB',
  'CB',
  'RWB',
  'LWB',
  'CDM',
  'CM',
  'CAM',
  'RM',
  'LM',
  'RW',
  'LW',
  'ST',
  'CF',
]);

export const roleSchema = z.enum([
  'sweeper_keeper',
  'shot_stopper',
  'ball_playing_defender',
  'stopper',
  'covering_defender',
  'attacking_fullback',
  'inverted_fullback',
  'defensive_fullback',
  'anchor',
  'deep_lying_playmaker',
  'box_to_box',
  'ball_winner',
  'advanced_playmaker',
  'shadow_striker',
  'inside_forward',
  'touchline_winger',
  'target_man',
  'poacher',
  'false_nine',
  'complete_forward',
]);

export const playerSchema = named.extend({
  age: z.number().int().min(15).max(45),
  /** ISO-3166 alpha-3. */
  nationality: z.string().length(3),
  positions: z.array(positionSchema).min(1),
  preferredRoles: z.array(roleSchema).min(1),
  nickname: z.string().optional(),
  technical: z.object({
    finishing: rating,
    longShots: rating,
    passing: rating,
    vision: rating,
    crossing: rating,
    dribbling: rating,
    firstTouch: rating,
    heading: rating,
    tackling: rating,
    marking: rating,
  }),
  physical: z.object({
    pace: rating,
    acceleration: rating,
    strength: rating,
    stamina: rating,
    agility: rating,
    jumping: rating,
  }),
  mental: z.object({
    positioning: rating,
    decisions: rating,
    composure: rating,
    workRate: rating,
    aggression: rating,
    anticipation: rating,
    teamwork: rating,
    leadership: rating,
  }),
  goalkeeping: z
    .object({
      handling: rating,
      reflexes: rating,
      aerialReach: rating,
      distribution: rating,
      oneOnOnes: rating,
    })
    .optional(),
});

export const clubSchema = named.extend({
  country: z.string().length(3),
  region: z.string().min(1),
  /** Decimal degrees. Used for real travel distance, which is a genuine lower-league fatigue input. */
  location: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
  reputation: rating,
  stadium: named.extend({
    capacity: z.number().int().min(100),
    pitchQuality: rating,
  }),
  squad: z.array(playerSchema).min(11, 'a club needs at least eleven players to field a side'),
});

/**
 * How a season is shaped and what happens at the end of it.
 *
 * These are fields rather than code because they genuinely differ by country: some leagues play a
 * single round-robin, some have playoffs, promotion counts vary.
 */
export const leagueSchema = named.extend({
  country: z.string().length(3),
  /** 1 = top flight. */
  tier: z.number().int().min(1).max(10),
  /** How many times each pair meets. 2 = home and away. */
  roundRobin: z.number().int().min(1).max(4),
  promotion: z.object({
    /** Number of clubs promoted automatically from the top of the table. */
    automatic: z.number().int().min(0),
    /** Number entering a promotion playoff below those. */
    playoff: z.number().int().min(0),
  }),
  relegation: z.object({ automatic: z.number().int().min(0) }),
  points: z.object({ win: z.number().int(), draw: z.number().int(), loss: z.number().int() }),
  /** Club slugs, resolved against data/clubs/<country>/. */
  clubs: z.array(slug).min(2),
});

export type PlayerData = z.infer<typeof playerSchema>;
export type ClubData = z.infer<typeof clubSchema>;
export type LeagueData = z.infer<typeof leagueSchema>;
