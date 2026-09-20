/* eslint-disable no-console */
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { reportPromptSizes, surveyPromptSizes } from './prompt-size.js';

const matches = Number(
  process.argv
    .slice(2)
    .find((a) => a.startsWith('--matches='))
    ?.slice(10) ?? 400,
);
const league = loadLeague(DATA_ROOT, 'egy-d4');
for (const line of reportPromptSizes(
  surveyPromptSizes(league.clubs, { matches, seed: 'prompt-size' }),
)) {
  console.log(line);
}
