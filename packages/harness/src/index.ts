export { playSeason, expectedAttendance } from './season.js';
export type { SeasonInput, SeasonResult, TableRow } from './season.js';
export { tacticsFor } from './tactics.js';
export { reportCauses, surveyCauses } from './causes.js';
export type { CauseCoverage, CauseSurvey, SurveyOptions } from './causes.js';
export {
  Accumulator,
  THRESHOLDS,
  correlation,
  identicalSeasons,
  reputationIndex,
} from './metrics.js';
export type { Measurement, Threshold, Verdict } from './metrics.js';
export { main, parseArgs } from './run.js';
export {
  DIALS,
  goalDifference,
  measure,
  report,
  verdictOf,
  type Cell,
  type Dial,
  type DominanceVerdict,
} from './dominance.js';
