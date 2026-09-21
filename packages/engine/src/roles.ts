import type { Player, PlayerAttributes, PlayerRole } from './types/player.js';

/**
 * Role fit: what a player is worth at the **job** he was given, not just in the area he stands in.
 *
 * The blueprint names role fit as one of the matchup inputs (§3), and until now the engine read a
 * role only to decide where a player drifts (`ROLE_DRIFT`) and how hard he works (`ROLE_EFFORT`).
 * Both are about the *instruction*. Neither asks the question a manager actually asks: **can this
 * player do this job?**
 *
 * Three properties make this a model rather than a bonus, and each one is a test:
 *
 * 1. **Scale-free.** The fit is a ratio of two means of the same player's own attributes, so
 *    multiplying every attribute he has by any factor leaves it unchanged. It therefore cannot
 *    favour the stronger squad — it measures the *shape* of a profile, never its level. Without
 *    this, role fit would be a second copy of squad quality and every threshold in the harness
 *    would move for a reason nobody could point at.
 * 2. **Centred, by construction.** The yardstick a role is measured against is the union of what
 *    *every* role of that kind demands, so the mean fit over the whole league and all roles is 1.
 *    Measured on the real Egyptian fourth division: **1.004** over 6,600 player-role pairs. A
 *    system where every player has a role that makes him better and none that makes him worse is a
 *    free uplift wearing a costume.
 * 3. **Two-sided.** The same choice helps one player and hurts another, which is
 *    `dakka-engine-rules` §4 stated in one axis: swap two midfielders' roles and one side of the
 *    swap always loses.
 *
 * **`preferredRoles` is deliberately not read here.** It is a label on a squad slot, and the squad
 * generator does not bias a single attribute to match it — so a player marked `stopper` has no more
 * tackling than the one marked `ball_playing_defender` beside him. Deriving a game number from that
 * label would be assigning a statistic rather than counting one, which is the one thing this
 * product exists not to do. When the generator makes the label true, this can read it; until then
 * the attributes are the only honest source.
 */

/**
 * Every attribute name the engine can read, flat.
 *
 * Flat because the twenty-nine names are unique across the four groups, and a flat name is what
 * makes `ROLE_DEMANDS` below readable as a table rather than as code. `attribute()` is a switch
 * rather than a lookup by path for the same reason `bandCompetence` is written as sums: this runs
 * inside the possession loop.
 */
export type AttributeName =
  | 'finishing'
  | 'longShots'
  | 'passing'
  | 'vision'
  | 'crossing'
  | 'dribbling'
  | 'firstTouch'
  | 'heading'
  | 'tackling'
  | 'marking'
  | 'pace'
  | 'acceleration'
  | 'strength'
  | 'stamina'
  | 'agility'
  | 'jumping'
  | 'positioning'
  | 'decisions'
  | 'composure'
  | 'workRate'
  | 'aggression'
  | 'anticipation'
  | 'teamwork'
  | 'leadership'
  | 'handling'
  | 'reflexes'
  | 'aerialReach'
  | 'distribution'
  | 'oneOnOnes';

/** A goalkeeping attribute a non-keeper does not have reads as 0 and is never asked for. */
export function attribute(a: PlayerAttributes, name: AttributeName): number {
  switch (name) {
    case 'finishing':
      return a.technical.finishing;
    case 'longShots':
      return a.technical.longShots;
    case 'passing':
      return a.technical.passing;
    case 'vision':
      return a.technical.vision;
    case 'crossing':
      return a.technical.crossing;
    case 'dribbling':
      return a.technical.dribbling;
    case 'firstTouch':
      return a.technical.firstTouch;
    case 'heading':
      return a.technical.heading;
    case 'tackling':
      return a.technical.tackling;
    case 'marking':
      return a.technical.marking;
    case 'pace':
      return a.physical.pace;
    case 'acceleration':
      return a.physical.acceleration;
    case 'strength':
      return a.physical.strength;
    case 'stamina':
      return a.physical.stamina;
    case 'agility':
      return a.physical.agility;
    case 'jumping':
      return a.physical.jumping;
    case 'positioning':
      return a.mental.positioning;
    case 'decisions':
      return a.mental.decisions;
    case 'composure':
      return a.mental.composure;
    case 'workRate':
      return a.mental.workRate;
    case 'aggression':
      return a.mental.aggression;
    case 'anticipation':
      return a.mental.anticipation;
    case 'teamwork':
      return a.mental.teamwork;
    case 'leadership':
      return a.mental.leadership;
    case 'handling':
      return a.goalkeeping?.handling ?? 0;
    case 'reflexes':
      return a.goalkeeping?.reflexes ?? 0;
    case 'aerialReach':
      return a.goalkeeping?.aerialReach ?? 0;
    case 'distribution':
      return a.goalkeeping?.distribution ?? 0;
    case 'oneOnOnes':
      return a.goalkeeping?.oneOnOnes ?? 0;
  }
}

/**
 * What each role is judged on.
 *
 * `Record<PlayerRole, ...>` so a role added without a decided set of demands is a build error — the
 * same guard `ROLE_DRIFT`, `ROLE_EFFORT` and `CAUSE_REGISTRY` use. Five attributes each, so the
 * means are comparable across roles without a weighting nobody could defend.
 *
 * A keeper role is identified by demanding a goalkeeping attribute, not by a second list: two lists
 * that must agree and cannot be compared are two lists that will drift.
 */
export const ROLE_DEMANDS: Record<PlayerRole, readonly AttributeName[]> = {
  shot_stopper: ['reflexes', 'handling', 'oneOnOnes', 'positioning', 'composure'],
  sweeper_keeper: ['distribution', 'aerialReach', 'anticipation', 'decisions', 'pace'],

  ball_playing_defender: ['passing', 'vision', 'composure', 'marking', 'firstTouch'],
  stopper: ['tackling', 'aggression', 'strength', 'marking', 'jumping'],
  covering_defender: ['positioning', 'anticipation', 'pace', 'marking', 'decisions'],
  attacking_fullback: ['crossing', 'stamina', 'pace', 'workRate', 'dribbling'],
  inverted_fullback: ['passing', 'vision', 'decisions', 'firstTouch', 'positioning'],
  defensive_fullback: ['marking', 'tackling', 'positioning', 'anticipation', 'strength'],

  anchor: ['positioning', 'marking', 'tackling', 'anticipation', 'decisions'],
  deep_lying_playmaker: ['passing', 'vision', 'composure', 'firstTouch', 'decisions'],
  box_to_box: ['stamina', 'workRate', 'passing', 'tackling', 'acceleration'],
  ball_winner: ['tackling', 'aggression', 'workRate', 'anticipation', 'strength'],
  advanced_playmaker: ['vision', 'passing', 'dribbling', 'firstTouch', 'composure'],

  shadow_striker: ['finishing', 'longShots', 'anticipation', 'acceleration', 'composure'],
  inside_forward: ['dribbling', 'finishing', 'firstTouch', 'acceleration', 'agility'],
  touchline_winger: ['pace', 'crossing', 'dribbling', 'acceleration', 'stamina'],
  target_man: ['heading', 'strength', 'jumping', 'firstTouch', 'composure'],
  poacher: ['finishing', 'anticipation', 'positioning', 'acceleration', 'composure'],
  false_nine: ['vision', 'passing', 'firstTouch', 'dribbling', 'decisions'],
  complete_forward: ['finishing', 'dribbling', 'strength', 'passing', 'heading'],
};

const ALL_ROLES = Object.keys(ROLE_DEMANDS) as readonly PlayerRole[];

const GOALKEEPING: ReadonlySet<AttributeName> = new Set<AttributeName>([
  'handling',
  'reflexes',
  'aerialReach',
  'distribution',
  'oneOnOnes',
]);

/** A role for a keeper is one that asks for a keeper's attributes. Read, never declared twice. */
export const isKeeperRole = (role: PlayerRole): boolean =>
  ROLE_DEMANDS[role].some((name) => GOALKEEPING.has(name));

const union = (roles: readonly PlayerRole[]): readonly AttributeName[] => [
  ...new Set(roles.flatMap((role) => ROLE_DEMANDS[role])),
];

/**
 * What a role is measured against: everything any role of that kind asks for.
 *
 * Deriving the yardstick from the demands is what centres the whole model. Pick any other
 * reference — a hand-listed set of "outfield attributes", say — and the mean fit drifts off 1 the
 * first time a role is added, quietly making every squad better or worse for no stated reason.
 */
export const YARDSTICK: {
  readonly keeper: readonly AttributeName[];
  readonly outfield: readonly AttributeName[];
} = {
  keeper: union(ALL_ROLES.filter(isKeeperRole)),
  outfield: union(ALL_ROLES.filter((role) => !isKeeperRole(role))),
};

function meanOf(a: PlayerAttributes, names: readonly AttributeName[]): number {
  let total = 0;
  for (const name of names) total += attribute(a, name);
  return total / names.length;
}

/** The raw 1–99 mean of what this role asks for. Exported because a test should read it. */
export const roleRating = (player: Player, role: PlayerRole): number =>
  meanOf(player.attributes, ROLE_DEMANDS[role]);

/** The same player's general level on the attribute space his kind of role is drawn from. */
export const yardstickRating = (player: Player): number =>
  meanOf(
    player.attributes,
    player.attributes.goalkeeping === undefined ? YARDSTICK.outfield : YARDSTICK.keeper,
  );

/**
 * How much of the fit ratio reaches the pitch.
 *
 * The sibling of `COMPETENCE_SPREAD`, and set the same way: measured first, then chosen. Over the
 * real league the ratio runs 0.77–1.27 with a 5th–95th percentile of 0.909–1.105, so at 0.5 a
 * well-suited player carries about 5% more into every zone he covers than a badly suited one, and
 * the extremes reach ±13%. That is deliberately smaller than what fitness or squad quality do:
 * being in the right job should be worth optimising and should never outrank being a better player.
 */
export const ROLE_FIT_SPREAD = 0.5;

/**
 * What the job does to what a player is worth, as a multiple of his general level.
 *
 * 1 means the job asks for exactly what he has. Above 1 he is better at this than at the average
 * job of his kind; below 1, worse. Nothing here reads the score, the opponent, or the team — it is
 * a property of one player and one instruction, which is what lets the same number explain both a
 * good selection and a bad one.
 */
export function roleFit(player: Player, role: PlayerRole): number {
  const yardstick = yardstickRating(player);
  if (yardstick <= 0) return 1;
  return 1 - ROLE_FIT_SPREAD + (ROLE_FIT_SPREAD * roleRating(player, role)) / yardstick;
}
