import { baselineTactics } from '@dakka/engine';
import type { MessageKey } from '../i18n/index.js';
import { useT } from '../i18n/context.js';
import { Dial } from '../components/Dial.js';
import { TeamSheet } from '../components/TeamSheet.js';
import { clubBySlug, type BrowserLeague } from '../data/league.js';
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
  readonly setup: Setup;
  readonly onChange: (next: Setup) => void;
  readonly onPlay: () => void;
}) {
  const t = useT();
  const yourClub = clubBySlug(league, setup.yourSlug);
  const sheet = baselineTactics(yourClub.squad);
  const context = buildMatch(league, setup).context;
  const callKind: CallKind = setup.call === null ? 'none' : setup.call.kind;
  const minute = setup.call?.minute ?? 60;

  return (
    <div className="grid gap-6">
      <section className="sheet grid gap-4">
        <h2 className="text-h2 font-semibold m-0">{t('setup.title')}</h2>

        <label className="grid gap-2">
          <span className="label">{t('setup.yourClub')}</span>
          <select
            className="control"
            value={setup.yourSlug}
            onChange={(e) => {
              const yourSlug = e.target.value;
              onChange({
                ...setup,
                yourSlug,
                opponentSlug:
                  yourSlug === setup.opponentSlug
                    ? (league.clubs.find((c) => c.slug !== yourSlug)?.slug ?? setup.opponentSlug)
                    : setup.opponentSlug,
              });
            }}
          >
            {league.clubs.map((club) => (
              <option key={club.slug} value={club.slug}>
                {club.shortName}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="label">{t('setup.opponent')}</span>
          <select
            className="control"
            value={setup.opponentSlug}
            onChange={(e) => onChange({ ...setup, opponentSlug: e.target.value })}
          >
            {league.clubs
              .filter((club) => club.slug !== setup.yourSlug)
              .map((club) => (
                <option key={club.slug} value={club.slug}>
                  {club.shortName}
                </option>
              ))}
          </select>
        </label>

        <Dial
          label="setup.venue"
          value={setup.venue}
          options={['home', 'away'] as const}
          optionKey={(option) => (option === 'home' ? 'setup.venue.home' : 'setup.venue.away')}
          onChange={(venue) => onChange({ ...setup, venue })}
        />

        <p className="text-small text-ink-soft m-0">
          {t('setup.attendance')} <span className="num">{int(context.attendance)}</span>
        </p>
        <p className="text-small text-ink-soft m-0">{t('setup.opponent.baseline')}</p>
      </section>

      <section className="sheet grid gap-4">
        <Dial
          label="setup.approach"
          value={setup.approach}
          options={APPROACHES}
          optionKey={(option) => APPROACH_KEY[option]}
          onChange={(approach) => onChange({ ...setup, approach })}
        />
        <Dial
          label="setup.line"
          value={setup.line}
          options={LINES}
          optionKey={(option) => LINE_KEY[option]}
          onChange={(line) => onChange({ ...setup, line })}
        />
        <Dial
          label="setup.press"
          value={setup.press}
          options={PRESSES}
          optionKey={(option) => PRESS_KEY[option]}
          onChange={(press) => onChange({ ...setup, press })}
        />
      </section>

      <section className="sheet grid gap-4">
        <p className="text-small text-ink-soft m-0">{t('setup.call.why')}</p>
        <Dial
          label="setup.call"
          value={callKind}
          options={CALL_KINDS}
          optionKey={(option) => CALL_KEY[option]}
          onChange={(kind) =>
            onChange({ ...setup, call: kind === 'none' ? null : defaultCall(kind, minute) })
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
                  onChange({ ...setup, call: { ...setup.call, minute: next } as Call });
                }}
              />
            </label>

            {setup.call.kind === 'mentality' && (
              <Dial
                label="setup.approach"
                value={setup.call.to as Approach}
                options={APPROACHES}
                optionKey={(option) => APPROACH_KEY[option]}
                onChange={(to) => onChange({ ...setup, call: { kind: 'mentality', minute, to } })}
              />
            )}
            {setup.call.kind === 'line_height' && (
              <Dial
                label="setup.line"
                value={setup.call.to as Line}
                options={LINES}
                optionKey={(option) => LINE_KEY[option]}
                onChange={(to) => onChange({ ...setup, call: { kind: 'line_height', minute, to } })}
              />
            )}
            {setup.call.kind === 'pressing' && (
              <Dial
                label="setup.press"
                value={setup.call.to as Press}
                options={PRESSES}
                optionKey={(option) => PRESS_KEY[option]}
                onChange={(to) => onChange({ ...setup, call: { kind: 'pressing', minute, to } })}
              />
            )}
          </>
        )}
      </section>

      <section className="sheet">
        <TeamSheet club={yourClub} tactics={sheet} mine />
      </section>

      <button type="button" className="button" onClick={onPlay}>
        {t('setup.play')}
      </button>
    </div>
  );
}
