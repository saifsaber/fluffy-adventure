/* eslint-disable no-console */
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { reportCauses, surveyCauses } from './causes.js';

const matches = Number(
  process.argv
    .slice(2)
    .find((a) => a.startsWith('--matches='))
    ?.slice(10) ?? 1200,
);
const league = loadLeague(DATA_ROOT, 'egy-d4');
for (const line of reportCauses(surveyCauses(league.clubs, { matches, seed: 'cause-survey' }))) {
  console.log(line);
}
