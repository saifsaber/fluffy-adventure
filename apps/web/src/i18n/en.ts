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
  'start.title': 'Pick the club you are taking over',
  'start.why':
    'Everything else follows from this: the table, what the board asks of you, and who you face next.',
  'start.begin': 'Take the job',

  'masthead.round': 'Round',

  'dash.decision': 'Your decision today',
  'dash.decision.table': 'Where the two of you stand',
  'dash.play': 'Set up the match',

  'dash.since': 'Since you last looked',
  'dash.since.matches': 'Matches played in the division',
  'dash.since.yours': 'Yours',
  'dash.since.position': 'Your position',
  'dash.since.points': 'Your points',

  'dash.onTrack': 'Against the board',
  'dash.onTrack.position': 'You are',
  'dash.onTrack.line': 'They asked for',
  'dash.onTrack.rival': 'Gap to',
  'dash.onTrack.games': 'Matches left',
  'dash.onTrack.available': 'Points still winnable',
  'dash.outlook.certain': 'Settled',
  'dash.outlook.undecided': 'Open',
  'dash.outlook.impossible': 'Gone',
  'dash.outlook.why.certain':
    'They cannot reach you winning every match left while you win none. Arithmetic, not a forecast.',
  'dash.outlook.why.undecided':
    'The arithmetic does not settle it, so neither do we. What is below is what there is.',
  'dash.outlook.why.impossible':
    'Winning every match left would still not get you there. Arithmetic, not an opinion.',

  'dash.risk': 'Biggest risk',
  'dash.risk.sack.at_risk': 'The board is at the line it set',
  'dash.risk.sack.warned': 'One win from the line the board set',
  'dash.risk.sack.untilImpossible':
    'The board said it acts once the objective is arithmetically out of reach.',
  'dash.risk.sack.adriftBy': 'The board named a distance from the line, and a match to count from.',
  'dash.risk.sack.threshold': 'The board acts at',
  'dash.risk.sack.fromGame': 'Counting from match',
  'dash.risk.adrift': 'Behind the line by',
  'dash.risk.slack': 'You can still drop',
  'dash.risk.beforeWindow': 'Matches before the board starts counting',
  'dash.risk.pace.yours': 'Your rate',
  'dash.risk.pace.chasing': 'Rate of the club you are chasing',
  'dash.risk.pace.chased': 'Rate of the club chasing you',
  'dash.risk.pace.behind': 'Behind by, per match',
  'dash.risk.pace.window': 'Matches counted',
  'dash.risk.pace.why': 'Both rates are counted over the same matches. Nothing here is projected.',

  'dash.assistant': 'Your assistant',
  'dash.assistant.cost': 'Cost you',
  'dash.assistant.matches': 'Matches it hurt you in',
  'dash.assistant.read': 'Matches read',
  'dash.assistant.evidence': 'Minutes',
  'dash.assistant.counted':
    'Counted from your own match traces. The reason came out of the match; nobody wrote it for you.',

  'setup.title': 'Next match',
  'setup.yourClub': 'Your club',
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
    'They start on an ordinary shape with every dial in the middle, and there is a man on their touchline: he pushes when he is behind, sees it out when he is ahead, and takes off whoever is finished. He sees the score, the clock and his own players — nothing you cannot see.',
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
  'result.you': 'You',
  'result.them': 'Them',
  'result.record': 'Record it and carry on',
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
