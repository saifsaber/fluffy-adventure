import { useT } from '../i18n/context.js';
import { int } from '../format.js';

/**
 * The top of the programme (DESIGN.md §5).
 *
 * Small on purpose. `h2` is the largest the product's own name is ever set in — a programme puts
 * the fixture first and its own masthead second, which is the fastest way this stops looking like
 * a dashboard.
 *
 * The round appears only once a season is running. It was absent for as long as there was no season
 * behind it — printing `1` because a programme usually has one would have been the smallest
 * possible fabricated statistic, and it would still have been one. It is a fact now, so it prints.
 */
export function Masthead({
  competition,
  round,
  aside,
}: {
  readonly competition: string;
  /** The round about to be played. Absent before a career exists, and at the end of a season. */
  readonly round?: number | undefined;
  /** Whatever the page keeps up here beside the name — today, the language control. */
  readonly aside?: React.ReactNode;
}) {
  const t = useT();
  return (
    <header className="flex items-baseline gap-2 px-[14px] pt-3 pb-2 border-b-[3px] border-double border-ink">
      <h1 className="text-h2 font-bold m-0">{t('app.name')}</h1>
      <p className="text-label text-ink-soft m-0 flex-1">{competition}</p>
      {round !== undefined && (
        <p className="border border-ink px-[6px] py-[1px] m-0 flex items-baseline gap-1">
          <span className="label">{t('masthead.round')}</span>
          <span className="num text-figure font-bold">{int(round)}</span>
        </p>
      )}
      {aside}
    </header>
  );
}
