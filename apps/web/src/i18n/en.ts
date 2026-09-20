import type { Dictionary } from './messages.js';

/**
 * English, written rather than translated (ADR-003 §2).
 *
 * Same assistant coach, his own register: blunt, football vernacular, no hedging, nothing softened
 * after a loss. Reading this next to `ar-EG.ts` should feel like the same person talking, not like
 * one file run through the other.
 */
export const en: Dictionary = {
  'app.name': 'Dakka',
  'app.subtitle': 'Every number here has a cause you can open.',

  'locale.switcher': 'Language',
  'locale.ar-EG': 'مصري',
  'locale.en': 'English',

  'match.kickoff': 'Kick-off',
  'match.pressure': 'Odds with you',
  'match.skip': 'Take me to full time',
  'match.call': 'Your call',
  'match.nothingYet': 'Nothing to say yet.',
  'match.replay':
    'The match is played. This reads it back to you minute by minute — skipping to the end changes nothing.',

  'setup.shape': 'Shape',
  'setup.shape.note': 'Your side only',
  'setup.shape.alt': '{club} on the pitch',
  'setup.opponent.unseen':
    'We have never played them, so there is nothing of theirs to draw. Play them once and their work shows up here.',
  'setup.title': 'Next match',
  'setup.yourClub': 'Your club',
  'setup.opponent': 'Opponent',
  'setup.venue': 'Venue',
  'setup.venue.home': 'At home',
  'setup.venue.away': 'Away',
  'setup.approach': 'Approach',
  'setup.line': 'Defensive line',
  'setup.press': 'Pressing',
  'setup.call': 'One call in the match',
  'setup.call.why':
    "Pick one thing to change while it's running. When it ends we replay the match without it and tell you exactly what it was worth.",
  'setup.call.none': 'No call',
  'setup.call.minute': 'Minute',
  'setup.opponent.baseline':
    "The opponent has no manager yet: ordinary shape, every dial in the middle. When it gets decisions of its own, we'll say so.",
  'setup.attendance': 'Attendance',
  'setup.sheet': 'Team sheet',
  'setup.sheet.auto':
    "The eleven picks itself for now: best available in each position. Choosing the players yourself isn't built yet.",
  'setup.play': 'Play the match',

  'mentality.defensive': 'Defensive',
  'mentality.balanced': 'Balanced',
  'mentality.attacking': 'Attacking',
  'line.deep': 'Deep',
  'line.normal': 'Normal',
  'line.high': 'High',
  'press.contain': 'Contain',
  'press.moderate': 'Moderate',
  'press.high': 'High',

  'result.fullTime': 'Full time',
  'result.back': 'Play another',
  'result.you': 'You',
  'result.them': 'Them',
  'result.seed': 'Seed',
  'result.seed.why':
    'This is the number that produced the match. Put it back with the same choices and you get the same match again — same goals, same minutes.',

  'stats.title': 'The numbers',
  'stat.shots': 'Shots',
  'stat.shotsOnTarget': 'On target',
  'stat.blocked': 'Blocked',
  'stat.corners': 'Corners',
  'stat.fouls': 'Fouls',
  'stat.cards': 'Cards',
  'stat.possession': 'Possession',
  'stat.xg': 'xG',
  'stat.open': 'Open {stat} and see where it came from',
  'stat.close': 'Close',

  'why.title': 'Where this number came from',
  'why.shots':
    'Every shot was recorded as it happened: the minute, the distance, the angle, how closely the shooter was closed down, and its own xG.',
  'why.possession': 'A share, worked out from the ticks counted for each side. Not an estimate.',
  'why.xg':
    "The sum of this match's shots. Each one comes from its own context: distance, angle, pressure, and what he hit it with.",
  'why.cards': 'Every card is stored with its minute and the player who took it.',
  'why.countedOnly':
    "Counted the moment it happened. The engine doesn't record the detail of each one separately yet.",
  'why.possessionTicks': 'Ticks counted',
  'why.empty': 'Nothing to show. It did not happen in this match.',

  'shot.minute': 'Minute',
  'shot.distance': 'Distance',
  'shot.angle': 'Angle',
  'shot.pressure': 'Pressure',
  'shot.outcome': 'Outcome',
  'shot.goal': 'Goal',
  'shot.saved': 'Saved',
  'shot.blocked': 'Blocked',
  'shot.offTarget': 'Off target',
  'shot.woodwork': 'Woodwork',
  'card.yellow': 'Yellow',
  'card.red': 'Red',

  'unmeasured.title': "What we don't measure",
  'unmeasured.body':
    "The engine doesn't work these out, so you won't get a 0 and you won't get a number we invented. No number beats a made-up one.",
  'unmeasured.passes': 'Passes',
  'unmeasured.offsides': 'Offsides',

  'trace.title': 'Where it turned',
  'trace.empty': 'Nothing turned it. No moment moved the odds far enough to name.',
  'trace.swing': 'Odds moved',
  'trace.favoured.you': 'your way',
  'trace.favoured.them': 'their way',

  'cf.title': "If you hadn't",
  'cf.why': 'Same match, same seed, same eleven — your call taken out. The difference is the call.',
  'cf.none': "You made no call in the match, so there's nothing to take out.",
  'cf.run': 'Run the comparison',
  'cf.running': 'Replaying…',
  'cf.runs': '{n} replays',
  'cf.points': 'Points',
  'cf.goalsFor': 'Goals for',
  'cf.goalsAgainst': 'Goals against',
  'cf.perMatch': 'per match',
  'cf.significant': 'Bigger than the noise',
  'cf.notSignificant': 'Could be luck',
  'cf.spread':
    'One match proves nothing. The number carries its own spread, and that is what says whether the difference is real.',
};
