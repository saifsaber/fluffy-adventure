import { describe, expect, it } from 'vitest';
import type { ClubId } from '@dakka/engine';
import {
  DATA_ROOT,
  generateFixtures,
  loadLeague,
  roundRobinRounds,
  roundsInSeason,
} from '../src/index.js';

const { league, clubs } = loadLeague(DATA_ROOT, 'egy-d4');
const clubIds = clubs.map((c) => c.id);
const fixtures = generateFixtures(league, clubIds);

describe('the schedule comes from the league file, not from code', () => {
  it('derives 38 rounds for 20 clubs meeting twice', () => {
    expect(roundsInSeason(league)).toBe(38);
    expect(Math.max(...fixtures.map((f) => f.round))).toBe(38);
  });

  it('would give a different season for a differently shaped league, with no code change', () => {
    // The point of the contract: change the data, the season changes.
    const single = { ...league, roundRobin: 1 };
    expect(roundsInSeason(single)).toBe(19);
    const smaller = { ...league, clubs: league.clubs.slice(0, 12) };
    expect(roundsInSeason(smaller)).toBe(22);
    // An odd club count means a bye each round, which is a valid league, not an error.
    const odd = { ...league, clubs: league.clubs.slice(0, 11) };
    expect(roundsInSeason(odd)).toBe(22);
  });
});

describe('the schedule is a real round-robin', () => {
  it('plays every club in every round, and never twice', () => {
    for (let round = 1; round <= roundsInSeason(league); round++) {
      const inRound = fixtures.filter((f) => f.round === round);
      expect(inRound, `round ${round}`).toHaveLength(clubIds.length / 2);
      const appearing = inRound.flatMap((f) => [f.home, f.away]);
      expect(new Set(appearing).size, `round ${round} has a club playing twice`).toBe(
        appearing.length,
      );
    }
  });

  it('has every pair meet exactly twice, once at each ground', () => {
    const meetings = new Map<string, number>();
    for (const f of fixtures) {
      const key = [f.home, f.away].sort().join('|');
      meetings.set(key, (meetings.get(key) ?? 0) + 1);
      meetings.set(`${f.home}>${f.away}`, (meetings.get(`${f.home}>${f.away}`) ?? 0) + 1);
    }
    const expectedPairs = (clubIds.length * (clubIds.length - 1)) / 2;
    const unordered = [...meetings.keys()].filter((k) => k.includes('|'));
    expect(unordered).toHaveLength(expectedPairs);
    for (const key of unordered) expect(meetings.get(key), key).toBe(2);
    // and each ordered direction exactly once — so nobody plays the same side twice at home
    const ordered = [...meetings.keys()].filter((k) => k.includes('>'));
    for (const key of ordered) expect(meetings.get(key), key).toBe(1);
  });

  it('gives every club the same number of matches, half of them at home', () => {
    for (const id of clubIds) {
      const home = fixtures.filter((f) => f.home === id).length;
      const away = fixtures.filter((f) => f.away === id).length;
      expect(home + away, id).toBe((clubIds.length - 1) * league.roundRobin);
      expect(home, `${id} home matches`).toBe(clubIds.length - 1);
      expect(away, `${id} away matches`).toBe(clubIds.length - 1);
    }
  });

  it('handles an odd field by resting one club per round rather than failing', () => {
    const rounds = roundRobinRounds(['a', 'b', 'c', 'd', 'e'] as unknown as ClubId[]);
    expect(rounds).toHaveLength(5);
    for (const pairs of rounds) expect(pairs).toHaveLength(2);
    const played = rounds.flat().flat();
    // five clubs, four opponents each, each pairing once
    expect(played).toHaveLength(20);
  });

  it('refuses a club list that does not match the league file', () => {
    expect(() => generateFixtures(league, clubIds.slice(0, 5))).toThrow(/lists 20 clubs but 5/);
  });
});
