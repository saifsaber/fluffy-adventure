/**
 * Every user-facing string in the product, as a closed contract.
 *
 * Both dictionaries are typed `Messages`, so a key missing from either locale is a build error and
 * a key in one locale but not the other cannot exist. A test also fails on any user-facing string
 * that appears in a component instead of here (ADR-003 §4) — structure nobody checks is structure
 * nobody has.
 *
 * `{name}` in a value is a parameter, substituted by `translator`. Numbers are never spelled out,
 * and Latin technical terms stay Latin in both locales.
 */
export interface Messages {
  /** The product name, in the script of the locale. */
  'app.name': string;
  'app.subtitle': string;

  /** Accessible name for the language control. */
  'locale.switcher': string;
  /** Each language names itself, in itself, whichever locale is active. */
  'locale.ar-EG': string;
  'locale.en': string;

  /** Section head over the pitch diagram. */
  'setup.shape': string;
  /** The note beside it: this is your side only, and why theirs is not drawn. */
  'setup.shape.note': string;
  /** Accessible name for the diagram — says whose shape it is, never just "pitch". */
  'setup.shape.alt': string;
  /**
   * Why the opponent is absent from the pitch. Not a placeholder: we have played them no times, so
   * there is nothing observed to draw, and drawing a generic shape would be inventing a scouting
   * report.
   */
  'setup.opponent.unseen': string;

  /** The reversed clock strip before the first minute. */
  'match.kickoff': string;
  /** The pressure band's label: win probability from your side, as the engine sampled it. */
  'match.pressure': string;
  /** Leaves the replay and goes straight to full time. The result is already decided either way. */
  'match.skip': string;
  /** The beat that marks your own in-match call. */
  'match.call': string;
  /** Said while the clock is running and nothing has happened yet. Not a loader. */
  'match.nothingYet': string;
  /** One line saying the replay is a record being read back, not a match being played. */
  'match.replay': string;

  'setup.title': string;
  'setup.yourClub': string;
  'setup.opponent': string;
  'setup.venue': string;
  'setup.venue.home': string;
  'setup.venue.away': string;
  'setup.approach': string;
  'setup.line': string;
  'setup.press': string;
  'setup.call': string;
  /** Why a single in-match call is asked for on this screen. */
  'setup.call.why': string;
  'setup.call.none': string;
  'setup.call.minute': string;
  /** Said plainly: an opponent with invented instructions would make the result a fiction. */
  'setup.opponent.baseline': string;
  'setup.attendance': string;
  'setup.sheet': string;
  /** Said plainly, because a team sheet you cannot change looks like a bug otherwise. */
  'setup.sheet.auto': string;
  'setup.play': string;

  'mentality.defensive': string;
  'mentality.balanced': string;
  'mentality.attacking': string;
  'line.deep': string;
  'line.normal': string;
  'line.high': string;
  'press.contain': string;
  'press.moderate': string;
  'press.high': string;

  'result.fullTime': string;
  'result.back': string;
  'result.you': string;
  'result.them': string;
  'result.seed': string;
  /** Why the seed is on screen rather than hidden. */
  'result.seed.why': string;

  'stats.title': string;
  'stat.shots': string;
  'stat.shotsOnTarget': string;
  'stat.blocked': string;
  'stat.corners': string;
  'stat.fouls': string;
  'stat.cards': string;
  'stat.possession': string;
  'stat.xg': string;
  /** Accessible name pattern for the button that opens a statistic's derivation. */
  'stat.open': string;
  'stat.close': string;

  /** Headings for the panel behind a statistic. */
  'why.title': string;
  'why.shots': string;
  'why.possession': string;
  'why.xg': string;
  'why.cards': string;
  /** Said when the engine counts a number but records no per-event detail for it. */
  'why.countedOnly': string;
  'why.possessionTicks': string;
  'why.empty': string;

  'shot.minute': string;
  'shot.distance': string;
  'shot.angle': string;
  'shot.pressure': string;
  'shot.outcome': string;
  'shot.goal': string;
  'shot.saved': string;
  'shot.blocked': string;
  'shot.offTarget': string;
  'shot.woodwork': string;
  'card.yellow': string;
  'card.red': string;

  /** The block that names what is deliberately not measured. Absent is not zero. */
  'unmeasured.title': string;
  'unmeasured.body': string;
  'unmeasured.passes': string;
  'unmeasured.offsides': string;

  'trace.title': string;
  'trace.empty': string;
  'trace.swing': string;
  'trace.favoured.you': string;
  'trace.favoured.them': string;

  'cf.title': string;
  'cf.why': string;
  'cf.none': string;
  'cf.run': string;
  'cf.running': string;
  'cf.runs': string;
  'cf.points': string;
  'cf.goalsFor': string;
  'cf.goalsAgainst': string;
  'cf.perMatch': string;
  'cf.significant': string;
  'cf.notSignificant': string;
  /** The honest caveat that has to travel with every measured difference. */
  'cf.spread': string;
}

/** A locale's complete set of strings. */
export type Dictionary = Readonly<Messages>;

export type MessageKey = keyof Messages;
