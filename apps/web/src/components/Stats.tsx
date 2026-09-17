import { useState } from 'react';
import type { MatchEvent, MatchResult, Shot, ShotOutcome, Side, SideStats } from '@dakka/engine';
import type { MessageKey } from '../i18n/index.js';
import { useT } from '../i18n/context.js';
import { dec, int, percent } from '../format.js';

/**
 * The numbers, every one of them openable.
 *
 * DESIGN.md §5: *every stat is a button that opens its cause — a stat with nothing behind it does
 * not ship*. Two kinds of thing satisfy that here, and the difference is the point. Shots, xG and
 * cards open the events the engine recorded as they happened. Corners and fouls open a plain
 * statement that the counter was incremented at the moment it occurred and no per-event detail is
 * stored yet — true, checkable, and not a number dressed up as more than it is.
 *
 * What never appears: a figure the engine did not produce. Passes and offsides have no counter at
 * all, so they are listed as absent further down rather than rendered as 0.
 */

type StatKind =
  'shots' | 'shotsOnTarget' | 'blocked' | 'xg' | 'possession' | 'corners' | 'fouls' | 'cards';

const OUTCOME_KEY: Record<ShotOutcome, MessageKey> = {
  goal: 'shot.goal',
  saved: 'shot.saved',
  blocked: 'shot.blocked',
  off_target: 'shot.offTarget',
  woodwork: 'shot.woodwork',
};

interface Row {
  readonly kind: StatKind;
  readonly label: MessageKey;
  readonly mine: string;
  readonly theirs: string;
}

function ShotTable({ shots }: { readonly shots: readonly Shot[] }) {
  const t = useT();
  if (shots.length === 0) return <p className="text-small text-ink-soft">{t('why.empty')}</p>;
  return (
    <table className="w-full text-small border-collapse">
      <thead>
        <tr>
          {(
            [
              'shot.minute',
              'shot.distance',
              'shot.angle',
              'shot.pressure',
              'stat.xg',
              'shot.outcome',
            ] as const
          ).map((key) => (
            <th key={key} className="label text-start cell font-semibold">
              {t(key)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {shots.map((shot, i) => (
          <tr key={`${shot.minute}-${i}`} className="border-t border-rule">
            {/*
              `cell` on the td, `num` on a span inside it — never both on one element. `num` sets
              `direction: ltr`, which flips what `padding-inline-end` means for that element, so a
              cell carrying both pads towards the previous column instead of the next one and the
              numbers run into the text beside them. The container follows the page; only the
              number isolates itself.
            */}
            <td className="cell">
              <span className="num">{int(shot.minute)}</span>
            </td>
            <td className="cell">
              <span className="num">{int(shot.distanceM)}</span>
            </td>
            <td className="cell">
              <span className="num">{int(shot.angleDeg)}</span>
            </td>
            <td className="cell">
              <span className="num">{int(shot.pressure)}</span>
            </td>
            <td className="cell">
              <span className="num">{dec(shot.xg, 2)}</span>
            </td>
            <td className="cell">{t(OUTCOME_KEY[shot.outcome])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Detail({
  kind,
  shots,
  mine,
  theirs,
  result,
  you,
}: {
  readonly kind: StatKind;
  readonly shots: readonly Shot[];
  readonly mine: SideStats;
  readonly theirs: SideStats;
  readonly result: MatchResult;
  readonly you: Side;
}) {
  const t = useT();
  const cards = result.events.filter(
    (e): e is Extract<MatchEvent, { kind: 'card' }> => e.kind === 'card' && e.side === you,
  );
  switch (kind) {
    case 'shots':
      return (
        <>
          <p className="text-small text-ink-soft mb-3">{t('why.shots')}</p>
          <ShotTable shots={shots} />
        </>
      );
    case 'shotsOnTarget':
      return (
        <>
          <p className="text-small text-ink-soft mb-3">{t('why.shots')}</p>
          <ShotTable shots={shots.filter((s) => s.outcome === 'goal' || s.outcome === 'saved')} />
        </>
      );
    case 'blocked':
      return (
        <>
          <p className="text-small text-ink-soft mb-3">{t('why.shots')}</p>
          <ShotTable shots={shots.filter((s) => s.outcome === 'blocked')} />
        </>
      );
    case 'xg':
      return (
        <>
          <p className="text-small text-ink-soft mb-3">{t('why.xg')}</p>
          <ShotTable shots={shots} />
        </>
      );
    case 'possession':
      return (
        <>
          <p className="text-small text-ink-soft mb-3">{t('why.possession')}</p>
          <p className="label">{t('why.possessionTicks')}</p>
          <p className="num text-h2">
            {int(mine.possessionTicks)} / {int(mine.possessionTicks + theirs.possessionTicks)}
          </p>
        </>
      );
    case 'cards':
      return (
        <>
          <p className="text-small text-ink-soft mb-3">{t('why.cards')}</p>
          {cards.length === 0 ? (
            <p className="text-small text-ink-soft">{t('why.empty')}</p>
          ) : (
            <ul className="list-none p-0 m-0">
              {cards.map((card, i) => (
                <li key={i} className="row text-small">
                  <span className="minute">{int(card.minute)}</span>
                  <span>{t(card.colour === 'red' ? 'card.red' : 'card.yellow')}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    default:
      return <p className="text-small text-ink-soft">{t('why.countedOnly')}</p>;
  }
}

export function Stats({ result, you }: { readonly result: MatchResult; readonly you: Side }) {
  const t = useT();
  const [open, setOpen] = useState<StatKind | null>(null);

  const mine = you === 'home' ? result.stats.home : result.stats.away;
  const theirs = you === 'home' ? result.stats.away : result.stats.home;
  const myShots = result.shots.filter((shot) => shot.side === you);
  const ticks = mine.possessionTicks + theirs.possessionTicks;

  const rows: readonly Row[] = [
    { kind: 'shots', label: 'stat.shots', mine: int(mine.shots), theirs: int(theirs.shots) },
    {
      kind: 'shotsOnTarget',
      label: 'stat.shotsOnTarget',
      mine: int(mine.shotsOnTarget),
      theirs: int(theirs.shotsOnTarget),
    },
    {
      kind: 'blocked',
      label: 'stat.blocked',
      mine: int(mine.blocked),
      theirs: int(theirs.blocked),
    },
    { kind: 'xg', label: 'stat.xg', mine: dec(mine.xg, 2), theirs: dec(theirs.xg, 2) },
    {
      kind: 'possession',
      label: 'stat.possession',
      mine: percent(mine.possessionTicks, ticks),
      theirs: percent(theirs.possessionTicks, ticks),
    },
    {
      kind: 'corners',
      label: 'stat.corners',
      mine: int(mine.corners),
      theirs: int(theirs.corners),
    },
    { kind: 'fouls', label: 'stat.fouls', mine: int(mine.fouls), theirs: int(theirs.fouls) },
    {
      kind: 'cards',
      label: 'stat.cards',
      mine: int(mine.yellowCards + mine.redCards),
      theirs: int(theirs.yellowCards + theirs.redCards),
    },
  ];

  return (
    <section className="sheet">
      <h2 className="text-h2 font-semibold m-0 mb-4">{t('stats.title')}</h2>

      <div className="flex text-small label mb-1">
        <span className="flex-1" />
        <span className="w-16 text-center">{t('result.you')}</span>
        <span className="w-16 text-center">{t('result.them')}</span>
      </div>

      <ul className="list-none p-0 m-0">
        {rows.map((row) => (
          <li key={row.kind} className="border-b border-rule last:border-b-0">
            <button
              type="button"
              className="flex items-center w-full text-start py-2 min-h-11 bg-transparent border-0 cursor-pointer"
              aria-expanded={open === row.kind}
              aria-label={t('stat.open', { stat: t(row.label) })}
              onClick={() => setOpen(open === row.kind ? null : row.kind)}
            >
              <span className="flex-1">{t(row.label)}</span>
              <span className="num w-16 text-center font-medium">{row.mine}</span>
              <span className="num w-16 text-center text-ink-soft">{row.theirs}</span>
            </button>
            {open === row.kind && (
              <div className="pb-4 pt-1">
                <p className="label mb-2">{t('why.title')}</p>
                <Detail
                  kind={row.kind}
                  shots={myShots}
                  mine={mine}
                  theirs={theirs}
                  result={result}
                  you={you}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-6 pt-4 border-t border-rule">
        <p className="label mb-2">{t('unmeasured.title')}</p>
        <ul className="list-none p-0 m-0">
          {(['unmeasured.passes', 'unmeasured.offsides'] as const).map((key) => (
            <li key={key} className="row text-small">
              <span className="flex-1">{t(key)}</span>
              {/* An em dash, not a zero. Absent is not zero — see `SideStats`. */}
              <span className="num w-16 text-center text-ink-faint">—</span>
            </li>
          ))}
        </ul>
        <p className="text-small text-ink-soft mt-3">{t('unmeasured.body')}</p>
      </div>
    </section>
  );
}
