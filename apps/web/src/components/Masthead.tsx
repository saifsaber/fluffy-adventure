import { useT } from '../i18n/context.js';

/**
 * The top of the programme (DESIGN.md §5).
 *
 * Small on purpose. `h2` is the largest the product's own name is ever set in — a programme puts
 * the fixture first and its own masthead second, which is the fastest way this stops looking like
 * a dashboard.
 *
 * There is no round number here. A round is a season fact and there is no season yet; printing
 * `1` because a programme usually has one would be the smallest possible fabricated statistic, and
 * it would still be one.
 */
export function Masthead({
  competition,
  aside,
}: {
  readonly competition: string;
  /** Whatever the page keeps up here beside the name — today, the language control. */
  readonly aside?: React.ReactNode;
}) {
  return (
    <header className="flex items-baseline gap-2 px-[14px] pt-3 pb-2 border-b-[3px] border-double border-ink">
      <h1 className="text-h2 font-bold m-0">{useT()('app.name')}</h1>
      <p className="text-label text-ink-soft m-0 flex-1">{competition}</p>
      {aside}
    </header>
  );
}
