/**
 * Build-time squad authoring tool.
 *
 * Reads the hand-authored club identities in `clubs.egy-d4.json` and writes complete club files to
 * `data/clubs/egy/`. Deterministic: the same input always produces the same squads, so the output
 * is reviewable in a diff and the generator can be deleted without breaking anything.
 *
 * See docs/decisions/ADR-002 §3 for why generated-then-committed content is authored content and
 * not the fabricated-statistics pattern this project exists to be better than.
 *
 * Run: node packages/content/scripts/generate-squads.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'data', 'clubs', 'egy');

/** mulberry32 — small, fast, and good enough for content authoring. */
function rng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  'أحمد',
  'محمد',
  'محمود',
  'مصطفى',
  'عمرو',
  'كريم',
  'إسلام',
  'حسن',
  'حسين',
  'عبدالله',
  'يوسف',
  'زياد',
  'طارق',
  'شريف',
  'هيثم',
  'وليد',
  'سيد',
  'رمضان',
  'صلاح',
  'عماد',
  'ياسر',
  'سامح',
  'هشام',
  'خالد',
  'عادل',
  'فتحي',
  'رجب',
  'بلال',
  'مينا',
  'بيشوي',
  'عصام',
  'نادر',
  'أيمن',
  'باسم',
  'تامر',
  'شادي',
  'مروان',
  'عمر',
  'أنس',
  'فارس',
];
const LAST = [
  'عبدالعال',
  'الشناوي',
  'بدوي',
  'قنديل',
  'الجزار',
  'سليم',
  'عوض',
  'حمدي',
  'فرغلي',
  'السقا',
  'الديب',
  'زهران',
  'مرسي',
  'عثمان',
  'شلبي',
  'غنيم',
  'الحلواني',
  'رزق',
  'سرحان',
  'عبدربه',
  'الشربيني',
  'منصور',
  'النجار',
  'قابيل',
  'الطوخي',
  'بركات',
  'صادق',
  'خميس',
  'الشاذلي',
  'لطفي',
  'عفيفي',
  'الجندي',
  'هلال',
  'سويلم',
  'العجمي',
  'دياب',
  'مطاوع',
  'شحاتة',
  'الفولي',
  'نصار',
];
const NICKNAMES = [
  'الصاروخ',
  'الأخطبوط',
  'الصخرة',
  'البلدوزر',
  'المايسترو',
  'الحاوي',
  'الفراشة',
  'الجوكر',
  'القناص',
  'الدينامو',
  'الفنان',
  'السد العالي',
  'الطيارة',
  'الجدار',
  'الحريف',
];

/** 21 players: enough for a starting XI, a full bench, and rotation. */
const SHAPE = [
  ['GK', ['shot_stopper'], 'gk'],
  ['GK', ['sweeper_keeper'], 'gk'],
  ['GK', ['shot_stopper'], 'gk'],
  ['RB', ['attacking_fullback'], 'def'],
  ['RB', ['defensive_fullback'], 'def'],
  ['LB', ['attacking_fullback'], 'def'],
  ['LB', ['inverted_fullback'], 'def'],
  ['CB', ['ball_playing_defender'], 'def'],
  ['CB', ['stopper'], 'def'],
  ['CB', ['covering_defender'], 'def'],
  ['CB', ['stopper'], 'def'],
  ['CDM', ['anchor'], 'mid'],
  ['CDM', ['ball_winner'], 'mid'],
  ['CM', ['box_to_box'], 'mid'],
  ['CM', ['deep_lying_playmaker'], 'mid'],
  ['CAM', ['advanced_playmaker'], 'mid'],
  ['CAM', ['shadow_striker'], 'mid'],
  ['RW', ['inside_forward'], 'fwd'],
  ['LW', ['touchline_winger'], 'fwd'],
  ['ST', ['poacher'], 'fwd'],
  ['ST', ['target_man'], 'fwd'],
];

/** Which attributes a playing style pushes up. Style is authored per club; this reads it. */
const STYLE_BIAS = {
  possession: { passing: 6, vision: 5, firstTouch: 4, composure: 3, pace: -2 },
  direct: { pace: 5, heading: 5, strength: 4, longShots: 3, passing: -3 },
  defensive: { tackling: 6, marking: 6, positioning: 5, aggression: 3, dribbling: -3 },
  counter: { pace: 7, acceleration: 6, anticipation: 4, finishing: 3, workRate: -2 },
  balanced: {},
};

/** Position groups emphasise different attributes. Everything is relative to club reputation. */
const GROUP_BIAS = {
  gk: { positioning: 6, composure: 5, pace: -12, finishing: -20, dribbling: -14, tackling: -10 },
  def: {
    tackling: 9,
    marking: 9,
    heading: 6,
    strength: 5,
    positioning: 4,
    finishing: -10,
    vision: -4,
  },
  mid: { passing: 8, vision: 6, workRate: 6, stamina: 6, teamwork: 5, heading: -4 },
  fwd: {
    finishing: 10,
    dribbling: 7,
    acceleration: 6,
    pace: 6,
    composure: 4,
    tackling: -10,
    marking: -10,
  },
};

const TECHNICAL = [
  'finishing',
  'longShots',
  'passing',
  'vision',
  'crossing',
  'dribbling',
  'firstTouch',
  'heading',
  'tackling',
  'marking',
];
const PHYSICAL = ['pace', 'acceleration', 'strength', 'stamina', 'agility', 'jumping'];
const MENTAL = [
  'positioning',
  'decisions',
  'composure',
  'workRate',
  'aggression',
  'anticipation',
  'teamwork',
  'leadership',
];
const KEEPING = ['handling', 'reflexes', 'aerialReach', 'distribution', 'oneOnOnes'];

const clamp = (n) => Math.max(1, Math.min(99, Math.round(n)));

function build(club) {
  const rand = rng(`dakka-v1:${club.slug}`);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const spread = (n) => (rand() + rand() - 1) * n; // triangular: clusters near the mean

  const usedSlugs = new Set();
  const styleBias = STYLE_BIAS[club.style] ?? {};

  const squad = SHAPE.map(([position, roles, group], index) => {
    // First-choice players are stronger than squad filler, which is what makes rotation a decision.
    const depth = index < 11 ? 4 : index < 18 ? 0 : -5;
    const base = club.reputation + depth + spread(5);
    const groupBias = GROUP_BIAS[group];

    const attr = (name) =>
      clamp(base + (groupBias[name] ?? 0) + (styleBias[name] ?? 0) + spread(7));

    const first = pick(FIRST);
    const last = pick(LAST);
    let slug = `${club.slug}-${index + 1}`;
    while (usedSlugs.has(slug)) slug = `${slug}x`;
    usedSlugs.add(slug);

    const player = {
      name: `${first} ${last}`,
      shortName: last,
      slug,
      age: 17 + Math.floor(rand() * 19),
      nationality: 'EGY',
      positions: [position],
      preferredRoles: roles,
      technical: Object.fromEntries(TECHNICAL.map((k) => [k, attr(k)])),
      physical: Object.fromEntries(PHYSICAL.map((k) => [k, attr(k)])),
      mental: Object.fromEntries(MENTAL.map((k) => [k, attr(k)])),
    };
    // One in six players carries a nickname — enough to feel local, rare enough to stay special.
    if (rand() < 0.17) player.nickname = pick(NICKNAMES);
    if (group === 'gk') {
      player.goalkeeping = Object.fromEntries(KEEPING.map((k) => [k, clamp(base + 8 + spread(6))]));
    }
    return player;
  });

  return {
    name: club.name,
    shortName: club.shortName,
    slug: club.slug,
    country: 'EGY',
    region: club.region,
    location: { lat: club.lat, lon: club.lon },
    reputation: club.reputation,
    stadium: {
      name: club.stadium,
      shortName: club.shortName,
      slug: `${club.slug}-stadium`,
      capacity: club.capacity,
      pitchQuality: club.pitch,
    },
    squad,
  };
}

const clubs = JSON.parse(readFileSync(join(here, 'clubs.egy-d4.json'), 'utf8'));
mkdirSync(OUT, { recursive: true });
for (const club of clubs) {
  writeFileSync(join(OUT, `${club.slug}.json`), JSON.stringify(build(club), null, 2) + '\n');
}
console.log(`wrote ${clubs.length} clubs, ${clubs.length * SHAPE.length} players`);
