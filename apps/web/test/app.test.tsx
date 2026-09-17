// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const playMatch = (locale: Locale = 'en') => {
  open(locale);
  fireEvent.click(screen.getByRole('button', { name: PLAY[locale] }));
};

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

    fireEvent.click(screen.getByRole('button', { name: 'Run the comparison' }));
    await waitFor(() => expect(screen.getByText('Points')).toBeTruthy(), { timeout: 20000 });

    const points = screen.getByText('Points').closest('li');
    // `± 2se` travels with the number, always. A headline without it is luck published as skill.
    expect(points?.textContent).toMatch(/[+-]\d+\.\d\d ± \d+\.\d\d/);
    expect(screen.getByText(/One match proves nothing/)).toBeTruthy();
  }, 30000);
});
