import { baselineTactics } from '@dakka/engine';
import type { MessageKey } from '../i18n/index.js';
import { useT } from '../i18n/context.js';
import { Dial } from '../components/Dial.js';
import { FixtureBar } from '../components/FixtureBar.js';
import { Pitch } from '../components/Pitch.js';
import { TeamSheet } from '../components/TeamSheet.js';
import { clubBySlug, dataBySlug, type BrowserLeague } from '../data/league.js';
import {
  APPROACHES,
  LINES,
  PRESSES,
  buildMatch,
  type Approach,
  type Call,
  type Line,
  type Press,
  type Setup,
} from '../match.js';
import { int } from '../format.js';
import type { Dials } from '../career.js';

const APPROACH_KEY: Record<Approach, MessageKey> = {
  defensive: 'mentality.defensive',
  balanced: 'mentality.balanced',
  attacking: 'mentality.attacking',
};
const LINE_KEY: Record<Line, MessageKey> = {
  deep: 'line.deep',
  normal: 'line.normal',
  high: 'line.high',
};
const PRESS_KEY: Record<Press, MessageKey> = {
  contain: 'press.contain',
  moderate: 'press.moderate',
  high: 'press.high',
};

type CallKind = Call['kind'] | 'none';

const CALL_KEY: Record<CallKind, MessageKey> = {
  none: 'setup.call.none',
  mentality: 'setup.approach',
  line_height: 'setup.line',
  pressing: 'setup.press',
};

const CALL_KINDS: readonly CallKind[] = ['none', 'mentality', 'line_height', 'pressing'];

/** A call needs a default target the moment its dial is chosen, so the shape is never half-built. */
function defaultCall(kind: Call['kind'], minute: number): Call {
  switch (kind) {
    case 'mentality':
      return { kind, minute, to: 'attacking' };
    case 'line_height':
      return { kind, minute, to: 'high' };
    case 'pressing':
      return { kind, minute, to: 'high' };
  }
}

export function SetupScreen({
  league,
  setup,
  onChange,
  onPlay,
}: {
  readonly league: BrowserLeague;
  /** The fixture as the season states it, with the manager's dials on top. */
  readonly setup: Setup;
  readonly onChange: (next: Dials) => void;
  readonly onPlay: () => void;
}) {
  const t = useT();
  // Only these four travel back. Who, where and which round are facts of the calendar, and a screen
  // that could send them back is a screen that could quietly change the fixture it was given.
  const dials: Dials = {
    approach: setup.approach,
    line: setup.line,
    press: setup.press,
    call: setup.call,
  };
  const yourClub = clubBySlug(league, setup.yourSlug);
  const theirClub = clubBySlug(league, setup.opponentSlug);
  const yourData = dataBySlug(league, setup.yourSlug);
  const theirData = dataBySlug(league, setup.opponentSlug);
  const sheet = baselineTactics(yourClub.squad);
  const context = buildMatch(league, setup).context;
  const callKind: CallKind = setup.call === null ? 'none' : setup.call.kind;
  const minute = setup.call?.minute ?? 60;

  // Who is at home decides which side of the bar each club sits on — the bar is the fixture, not
  // a list of the two clubs in the order the form happens to hold them.
  const atHome = setup.venue === 'home';
  const side = (club: typeof yourClub, data: typeof yourData) => ({
    club,
    kit: data.kit,
    region: data.region,
  });

  return (
    <div className="grid gap-6">
      <div className="-mx-4 md:-mx-6">
        <FixtureBar
          home={atHome ? side(yourClub, yourData) : side(theirClub, theirData)}
          away={atHome ? side(theirClub, theirData) : side(yourClub, yourData)}
          standing={
            <span className="text-label font-bold leading-tight">
              {t(atHome ? 'setup.venue.home' : 'setup.venue.away')}
            </span>
          }
        />
      </div>

      <section>
        <p className="head">
          <span>{t('setup.shape')}</span>
          <span className="text-faint font-normal">{t('setup.shape.note')}</span>
        </p>
        <div className="panel p-0">
          <Pitch
            club={yourClub}
            kit={yourData.kit}
            startingXI={sheet.startingXI}
            label={t('setup.shape.alt', { club: yourClub.shortName })}
          />
        </div>
        <p className="text-small text-ink-soft mt-3">{t('setup.opponent.unseen')}</p>
      </section>

      <section className="panel grid gap-4">
        <h2 className="text-h2 font-bold m-0">{t('setup.title')}</h2>
        <p className="text-small text-ink-soft m-0">
          {t('setup.attendance')} <span className="num">{int(context.attendance)}</span>
        </p>
        <p className="text-small text-ink-soft m-0">{t('setup.opponent.baseline')}</p>
      </section>

      <section className="panel grid gap-4">
        <Dial
          label="setup.approach"
          value={setup.approach}
          options={APPROACHES}
          optionKey={(option) => APPROACH_KEY[option]}
          onChange={(approach) => onChange({ ...dials, approach })}
        />
        <Dial
          label="setup.line"
          value={setup.line}
          options={LINES}
          optionKey={(option) => LINE_KEY[option]}
          onChange={(line) => onChange({ ...dials, line })}
        />
        <Dial
          label="setup.press"
          value={setup.press}
          options={PRESSES}
          optionKey={(option) => PRESS_KEY[option]}
          onChange={(press) => onChange({ ...dials, press })}
        />
      </section>

      <section className="panel grid gap-4">
        <p className="text-small text-ink-soft m-0">{t('setup.call.why')}</p>
        <Dial
          label="setup.call"
          value={callKind}
          options={CALL_KINDS}
          optionKey={(option) => CALL_KEY[option]}
          onChange={(kind) =>
            onChange({ ...dials, call: kind === 'none' ? null : defaultCall(kind, minute) })
          }
        />

        {setup.call !== null && (
          <>
            <label className="grid gap-2 max-w-40">
              <span className="label">{t('setup.call.minute')}</span>
              <input
                className="control num"
                type="number"
                min={1}
                max={89}
                value={setup.call.minute}
                onChange={(e) => {
                  const next = Math.min(89, Math.max(1, Number(e.target.value) || 1));
                  onChange({ ...dials, call: { ...setup.call, minute: next } as Call });
                }}
              />
            </label>

            {setup.call.kind === 'mentality' && (
              <Dial
                label="setup.approach"
                value={setup.call.to as Approach}
                options={APPROACHES}
                optionKey={(option) => APPROACH_KEY[option]}
                onChange={(to) => onChange({ ...dials, call: { kind: 'mentality', minute, to } })}
              />
            )}
            {setup.call.kind === 'line_height' && (
              <Dial
                label="setup.line"
                value={setup.call.to as Line}
                options={LINES}
                optionKey={(option) => LINE_KEY[option]}
                onChange={(to) => onChange({ ...dials, call: { kind: 'line_height', minute, to } })}
              />
            )}
            {setup.call.kind === 'pressing' && (
              <Dial
                label="setup.press"
                value={setup.call.to as Press}
                options={PRESSES}
                optionKey={(option) => PRESS_KEY[option]}
                onChange={(to) => onChange({ ...dials, call: { kind: 'pressing', minute, to } })}
              />
            )}
          </>
        )}
      </section>

      <section>
        <p className="head">
          <span>{t('setup.sheet')}</span>
        </p>
        <TeamSheet club={yourClub} tactics={sheet} mine />
      </section>

      <button type="button" className="action" onClick={onPlay}>
        {t('setup.play')}
      </button>
    </div>
  );
}
