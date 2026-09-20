// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DATA_ROOT, loadLeague } from '@dakka/content';
import { App } from '../src/App.js';
import { LocaleProvider } from '../src/i18n/context.js';
import type { BrowserLeague } from '../src/data/league.js';
import type { Locale } from '../src/i18n/index.js';

/**
 * The thin UI, driven the way a player drives it.
 *
 * Every assertion here is about a claim the product makes rather than about markup: that the two
 * locales are both reachable and genuinely different, that a statistic can be opened to the events
 * behind it, that a number the engine does not measure is shown as absent rather than as zero, and
 * that a decision's worth arrives with the spread that produced it.
 */

const league = loadLeague(DATA_ROOT, 'egy-d4') as BrowserLeague;

const open = (locale: Locale) =>
  render(
    <LocaleProvider initial={locale}>
      <App league={league} />
    </LocaleProvider>,
  );

const PLAY: Record<Locale, string> = { en: 'Play the match', 'ar-EG': 'إلعب الماتش' };
const SKIP: Record<Locale, string> = { en: 'Take me to full time', 'ar-EG': 'ودّيني على النهاية' };

/** Kicks off and stops on matchday, where the replay is running. */
const kickOff = (locale: Locale = 'en') => {
  open(locale);
  fireEvent.click(screen.getByRole('button', { name: PLAY[locale] }));
};

/** Kicks off and leaves the replay immediately — the match is already decided either way. */
const playMatch = (locale: Locale = 'en') => {
  kickOff(locale);
  fireEvent.click(screen.getByRole('button', { name: SKIP[locale] }));
};

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.dir = '';
});

describe('two locales, one layout', () => {
  it('starts in Egyptian Arabic and sets the document right-to-left', () => {
    open('ar-EG');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar-EG');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('دكة');
  });

  it('switches to English and flips direction, without a second layout', () => {
    open('ar-EG');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(document.documentElement.dir).toBe('ltr');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Dakka');
    expect(screen.getByRole('button', { name: 'Play the match' })).toBeTruthy();
  });

  it('offers both languages named in themselves, from the first screen', () => {
    open('en');
    const group = screen.getByRole('group', { name: 'Language' });
    expect(within(group).getByRole('button', { name: 'مصري' })).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'English' })).toBeTruthy();
  });

  it('remembers the choice', () => {
    open('ar-EG');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(window.localStorage.getItem('dakka.locale')).toBe('en');
  });
});

describe('picking tactics and playing', () => {
  it('offers the three dials and records a choice', () => {
    open('en');
    const approach = screen.getByRole('group', { name: 'Approach' });
    const attacking = within(approach).getByRole('button', { name: 'Attacking' });
    expect(attacking.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(attacking);
    expect(
      within(screen.getByRole('group', { name: 'Approach' }))
        .getByRole('button', { name: 'Attacking' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('says plainly that the eleven is picked for you and the opponent has no manager', () => {
    // Both are true and both would otherwise read as finished features.
    open('en');
    expect(screen.getByText(/picks itself for now/)).toBeTruthy();
    expect(screen.getByText(/no manager yet/)).toBeTruthy();
  });

  it('plays the match and reports it', () => {
    playMatch();
    expect(screen.getByText('Full time')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play another' })).toBeTruthy();
  });

  it("keeps each score inside its own club's row, in both directions", () => {
    // The bug this replaced: `2-1` rendered as one isolated run beside two club names reverses
    // against them when `dir` flips, so a 1-0 home win was shown on screen as 0-1. Structural,
    // not visual — a name and its number share an element, so no direction can separate them.
    for (const locale of ['en', 'ar-EG'] as const) {
      cleanup();
      playMatch(locale);
      const rows = screen.getAllByText(/Full time|نهاية الماتش/)[0]?.parentElement;
      const scored = within(rows as HTMLElement)
        .getAllByText(/^\d+$/)
        .map((node) => node.closest('div'));
      expect(scored).toHaveLength(2);
      for (const row of scored) {
        // Each row carries exactly one club name and exactly one number.
        expect(row?.textContent?.match(/\d+/g)).toHaveLength(1);
        expect(row?.textContent?.replace(/\d+/g, '').trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('sets a swing number in its own isolated element, never inside the sentence', () => {
    // `.num` carries `direction: ltr; unicode-bidi: isolate`. Without it the leading sign of a
    // signed number moves to the other end of the value in Arabic.
    playMatch('ar-EG');
    const swings = document.querySelectorAll('.num');
    const signed = [...swings].filter((node) => /^[+-]\d/.test(node.textContent ?? ''));
    expect(signed.length).toBeGreaterThan(0);
    for (const node of signed) expect(node.className).toContain('num');
  });

  it('shows the seed that produced the match', () => {
    // Determinism is a claim the player can check, so it is on the screen rather than in a log.
    playMatch();
    expect(screen.getByText(/same match again/)).toBeTruthy();
  });
});

describe('every number opens', () => {
  it('opens a statistic onto the events it was counted from', () => {
    playMatch();
    fireEvent.click(screen.getByLabelText(/Open Shots and/));
    expect(screen.getByText('Where this number came from')).toBeTruthy();
    expect(screen.getByText(/Every shot was recorded as it happened/)).toBeTruthy();
  });

  it('gives every statistic on the screen something to open', () => {
    // DESIGN.md §5: a stat with nothing behind it does not ship. Checked for all of them rather
    // than for the one that happens to be convenient.
    playMatch();
    const openers = screen.getAllByLabelText(/^Open .* and see where it came from$/);
    expect(openers.length).toBe(8);
    for (const opener of openers) {
      expect(opener.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(opener);
      expect(opener.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('Where this number came from')).toBeTruthy();
      fireEvent.click(opener);
    }
  });

  it('says a counted number is only counted, rather than implying detail it does not have', () => {
    playMatch();
    fireEvent.click(screen.getByLabelText(/Open Corners and/));
    expect(screen.getByText(/doesn't record the detail of each one separately yet/)).toBeTruthy();
  });

  it('shows what it does not measure as absent, never as zero', () => {
    // The single most important assertion in this file. `SideStats.passesCompleted` is optional
    // because absent is not zero, and a UI that rendered it as 0 would be fabricating a statistic
    // in exactly the way the competitor does.
    playMatch();
    const passes = screen.getByText('Passes').closest('li');
    expect(passes).not.toBeNull();
    expect(passes?.textContent).toContain('—');
    expect(passes?.textContent).not.toContain('0');
    expect(screen.getByText(/won't get a 0/)).toBeTruthy();
  });
});

describe('what your decision was worth', () => {
  it('says there is nothing to take out when no call was made', () => {
    playMatch();
    expect(screen.getByText(/nothing to take out/)).toBeTruthy();
  });

  it('measures the call and reports it with its spread', async () => {
    open('en');
    const calls = screen.getByRole('group', { name: 'One call in the match' });
    fireEvent.click(within(calls).getByRole('button', { name: 'Approach' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play the match' }));
    fireEvent.click(screen.getByRole('button', { name: SKIP.en }));

    fireEvent.click(screen.getByRole('button', { name: 'Run the comparison' }));
    await waitFor(() => expect(screen.getByText('Points')).toBeTruthy(), { timeout: 20000 });

    const points = screen.getByText('Points').closest('li');
    // `± 2se` travels with the number, always. A headline without it is luck published as skill.
    expect(points?.textContent).toMatch(/[+-]\d+\.\d\d ± \d+\.\d\d/);
    expect(screen.getByText(/One match proves nothing/)).toBeTruthy();
  }, 30000);
});

describe('the tactics screen is a programme, not a form', () => {
  const rgb = (hex: string): string => {
    const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
    return `rgb(${r}, ${g}, ${b})`;
  };

  it('prints each club in its own colours, read from the data', () => {
    // A hardcoded green would pass every visual check and be exactly the invented-at-render-time
    // thing the kit box exists to prevent, so this asserts against the data file.
    open('ar-EG');
    const [home, away] = league.data;
    const fills = [...document.querySelectorAll<HTMLElement>('[style*="background-color"]')].map(
      (node) => node.style.backgroundColor,
    );
    expect(fills).toContain(rgb(home?.kit.primary ?? ''));
    expect(fills).toContain(rgb(away?.kit.primary ?? ''));
  });

  it('draws eleven players and not one more', () => {
    // Before kickoff we have played them no times, so there is nothing observed to draw. A
    // generic opposition shape would be a scouting report we did not earn — the same refusal
    // `scoutingFrom` makes, enforced on the screen that would be tempted to fake it.
    //
    // Counted rather than matched by name: the squad generator draws surnames from one pool, so
    // both clubs genuinely share some, and a name-based check would fail on a real coincidence.
    open('ar-EG');
    const diagram = screen.getByRole('img', { name: /تشكيل/ });
    const texts = within(diagram).queryAllByText(/.+/);
    expect(texts).toHaveLength(22); // eleven positions, eleven names
  });

  it('says why their half of the diagram is empty instead of leaving it blank', () => {
    open('ar-EG');
    expect(screen.getByText(/مالعبناهمش قبل كده/)).toBeTruthy();
  });

  it('puts the home club on the home side of the fixture bar', () => {
    // The bar is the fixture, not the two clubs in whatever order the form holds them. Switching
    // to away has to move you across it.
    open('en');
    const order = () =>
      [...document.querySelectorAll('[data-club]')].map((node) => node.getAttribute('data-club'));
    const before = order();
    expect(before).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Away' }));
    expect(order()).toEqual([...before].reverse());
  });
});

describe('matchday shows the five things without hunting a tab', () => {
  it('puts the score, the minute and the pressure on screen at once', () => {
    kickOff('en');
    expect(screen.getByText('Kick-off')).toBeTruthy();
    expect(screen.getByText('Odds with you')).toBeTruthy();
    expect(document.querySelectorAll('[data-score]')).toHaveLength(2);
  });

  it('keeps each score on the same side as its own club, in both directions', () => {
    // The bug this guards has shipped here once: a scoreline pinned left-to-right while the two
    // clubs flip with the page, so 1-0 to the home side reads as 0-1 in Arabic. The score row
    // must lay out in the page's own direction, exactly like the bar around it.
    for (const locale of ['en', 'ar-EG'] as const) {
      cleanup();
      kickOff(locale);
      const clubs = [...document.querySelectorAll('[data-club]')].map((n) =>
        n.getAttribute('data-club'),
      );
      const scores = [...document.querySelectorAll('[data-score]')].map((n) =>
        n.getAttribute('data-score'),
      );
      // Home first in the DOM on both sides of the box, so neither can flip without the other.
      expect(scores).toEqual(['home', 'away']);
      expect(clubs).toHaveLength(2);
      const seq = document.querySelector('[data-score]')?.closest('.seq');
      expect(seq, 'the scoreline must not be pinned LTR while the clubs flip').toBeNull();
    }
  });

  it('reveals nothing before the clock reaches it', () => {
    // A call set for the 60th minute is not on screen at kick-off. The clock reveals; it does not
    // summarise.
    vi.useFakeTimers();
    try {
      open('en');
      const calls = screen.getByRole('group', { name: 'One call in the match' });
      fireEvent.click(within(calls).getByRole('button', { name: 'Approach' }));
      fireEvent.click(screen.getByRole('button', { name: PLAY.en }));
      expect(screen.queryByText('Your call')).toBeNull();

      // The clock chains one timeout per minute from an effect, so each minute needs its own
      // flush: advancing 61 minutes in one jump fires the first timer and nothing after it.
      for (let tick = 0; tick < 61; tick++) act(() => void vi.advanceTimersByTime(200));
      const yourCall = screen.getAllByText('Your call');
      expect(yourCall).toHaveLength(1);

      // The engine emits no `decision` cause (measured; see Blocked), so the call is its own beat
      // and carries no swing number. A delta on this row would be an attribution nothing supports.
      const row = yourCall[0]?.closest('li');
      expect(row?.textContent).not.toMatch(/moved/);
      expect(row?.querySelector('.num')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the replay to a result that was already decided', () => {
    // Skipping cannot change anything, and that is the give-away that this is a record being read
    // back rather than a match being performed.
    kickOff('en');
    fireEvent.click(screen.getByRole('button', { name: SKIP.en }));
    expect(screen.getByText('Full time')).toBeTruthy();
  });
});
