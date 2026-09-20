import { describe, expect, it } from 'vitest';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { baselineTactics, clubId, competitionId, matchId, simulate } from '@dakka/engine';
import type { MatchInput, MatchResult } from '@dakka/engine';
import { LOCALES, briefingPrompt, numbersInText, scoutingFrom } from '../src/index.js';
import { compiles } from './compile.js';

/**
 * What the model is allowed to know about a side it has not signed.
 *
 * The rule is that you scout by watching: every figure comes from matches actually played, never
 * from the opponent's squad. The most important tests here are the refusals — the one that proves
 * a `Club` cannot be handed over in a record's place, and the one that proves a side you have never
 * met produces a briefing that says so rather than a confident paragraph about nobody.
 */

const league = loadLeague(DATA_ROOT, 'egy-d4');
const [home, away, third] = league.clubs;
if (home === undefined || away === undefined || third === undefined)
  throw new Error('short league');

const fixture = (n: number): MatchInput => ({
  id: matchId(`scout-${n}`),
  seed: `scout-${n}`,
  home: { club: home, tactics: baselineTactics(home.squad), decisions: [] },
  away: { club: away, tactics: baselineTactics(away.squad), decisions: [] },
  context: {
    competitionId: competitionId('egy-d4'),
    awayTravelKm: 140,
    attendance: 1200,
    isDerby: false,
  },
});

const played: readonly MatchResult[] = [0, 1, 2, 3].map((n) => simulate(fixture(n)));
const record = scoutingFrom(played, away.id);
const names = new Map(away.squad.map((p) => [p.id, p.shortName]));

describe('the record is counted from matches, not read off a squad', () => {
  it('counts only the matches that club actually played in', () => {
    expect(record.observed).toBe(4);
    expect(scoutingFrom(played, third.id).observed).toBe(0);
    expect(scoutingFrom(played, clubId('nobody')).observed).toBe(0);
  });

  it('adds up to what the results say', () => {
    const goalsFor = played.reduce((sum, r) => sum + r.awayScore, 0);
    const goalsAgainst = played.reduce((sum, r) => sum + r.homeScore, 0);
    const shots = played.reduce((sum, r) => sum + r.stats.away.shots, 0);
    expect(record.goalsFor).toBe(goalsFor);
    expect(record.goalsAgainst).toBe(goalsAgainst);
    expect(record.shots).toBe(shots);
    expect(record.xg).toBeCloseTo(
      played.reduce((sum, r) => sum + r.stats.away.xg, 0),
      6,
    );
  });

  it('refuses a Club where a record is wanted, so hidden attributes have no route in', () => {
    // The guard the whole box turns on. A fourth-division manager cannot open a rival's attribute
    // values, and neither can the model — so the function that feeds a prompt takes results.
    const attempt = compiles(
      'club-as-scouting',
      `import { briefingPrompt, scoutingFrom } from '../../src/index.js';
       import { clubId, type Club } from '@dakka/engine';
       declare const club: Club;
       briefingPrompt(club, 'x', 'en');`,
    );
    expect(attempt.ok, attempt.messages.join(' | ')).toBe(false);
  });

  it('accepts what scoutingFrom returned, so the boundary is a door', () => {
    const attempt = compiles(
      'record-ok',
      `import { briefingPrompt, scoutingFrom } from '../../src/index.js';
       import { clubId, type MatchResult } from '@dakka/engine';
       declare const results: readonly MatchResult[];
       briefingPrompt(scoutingFrom(results, clubId('x')), 'x', 'en');`,
    );
    expect(attempt.ok, attempt.messages.join(' | ')).toBe(true);
  });
});

describe('absent is not zero', () => {
  it('leaves the shot shares undefined when nothing has been shot', () => {
    // "They never shoot from range" and "we have not seen them shoot" are different claims, and
    // only one of them is true before a ball is kicked.
    const unseen = scoutingFrom([], away.id);
    expect(unseen.shots).toBe(0);
    expect(unseen.fromSetPieces).toBeUndefined();
    expect(unseen.fromCounters).toBeUndefined();
    expect(unseen.fromCloseRange).toBeUndefined();
    expect(unseen.scorers).toEqual([]);
  });

  it('computes the shares once there is something to divide', () => {
    expect(record.fromSetPieces).toBeGreaterThanOrEqual(0);
    const total =
      (record.fromSetPieces ?? 0) + (record.fromCounters ?? 0) + (record.fromCloseRange ?? 0);
    expect(Number.isFinite(total)).toBe(true);
  });
});

describe('the briefing', () => {
  it('says we know nothing when we have seen nothing, and asks for one sentence', () => {
    for (const locale of LOCALES) {
      const prompt = briefingPrompt(scoutingFrom([], away.id), away.shortName, locale);
      expect(prompt.observed).toBe(0);
      expect(numbersInText(prompt.scouting)).toEqual([]);
      expect(prompt.task).toMatch(locale === 'en' ? /one sentence/ : /جملة واحدة/);
    }
  });

  it('puts every opponent number in one block, and counts them all from the record', () => {
    for (const locale of LOCALES) {
      const prompt = briefingPrompt(record, away.shortName, locale, names);
      const allowed = new Set<number>([
        record.observed,
        record.goalsFor,
        record.goalsAgainst,
        record.shots,
        record.shotsOnTarget,
        Number(record.xg.toFixed(2)),
        record.yellowCards,
        record.redCards,
        ...[record.fromSetPieces, record.fromCounters, record.fromCloseRange].map((s) =>
          Math.round((s ?? 0) * 100),
        ),
        ...record.scorers.map((s) => s.goals),
      ]);
      for (const value of numbersInText(prompt.scouting)) {
        expect(allowed.has(value), `${locale}: ${value} was not counted from a match we saw`).toBe(
          true,
        );
      }
    }
  });

  it('keeps opponent facts out of the instructions', () => {
    const prompt = briefingPrompt(record, away.shortName, 'en', names);
    for (const block of [prompt.system, prompt.task]) {
      expect(numbersInText(block)).toEqual([]);
    }
  });

  it('never names a scorer it has no name for', () => {
    // A goal counted against an unresolved id is still a real goal, but writing "someone scored 2"
    // is worse than not mentioning it. The line is dropped, not filled with a placeholder.
    const prompt = briefingPrompt(record, away.shortName, 'en');
    expect(prompt.scouting).not.toMatch(/undefined|null/);
  });

  it('writes each locale in its own words', () => {
    const ar = briefingPrompt(record, away.shortName, 'ar-EG', names);
    const en = briefingPrompt(record, away.shortName, 'en', names);
    expect(ar.system).not.toBe(en.system);
    expect(ar.scouting).not.toBe(en.scouting);
    expect(ar.task).not.toBe(en.task);
  });
});
