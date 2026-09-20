import type { Club } from '@dakka/engine';
import type { Kit } from '@dakka/content/pure';

/**
 * The object the whole product hangs off (DESIGN.md §5).
 *
 * Two clubs facing each other across a recessed box. The box holds the fixture's standing fact:
 * where it is being played before kickoff, the score once there is one.
 *
 * **Each club's name and its own number live in one element.** That is §3's bidi rule made
 * structural rather than remembered — three inline pieces reorder around each other in Arabic, and
 * this product has already shipped a 1-0 home win that rendered as 0-1. Pairing a club with its own
 * figure means no direction can separate them.
 *
 * The trim prints as a band inside the swatch. A trim is validated against the shirt it sits on and
 * not against the page, so a cream trim outside the swatch would disappear into the paper.
 */

function Swatch({ kit }: { readonly kit: Kit }) {
  return (
    <span
      aria-hidden
      className="block w-[22px] h-[32px] rounded-[2px] shrink-0"
      style={{
        backgroundColor: kit.primary,
        borderBlockStart: `6px solid ${kit.secondary}`,
      }}
    />
  );
}

function Side({
  club,
  kit,
  region,
  away,
}: {
  readonly club: Club;
  readonly kit: Kit;
  readonly region: string;
  readonly away: boolean;
}) {
  return (
    <div
      data-club={club.slug}
      className={`flex flex-1 items-center gap-[10px] px-[14px] py-[13px] ${away ? 'flex-row-reverse text-end' : ''}`}
    >
      <Swatch kit={kit} />
      <span className="min-w-0">
        <span className="block text-h1 font-bold leading-tight truncate">{club.shortName}</span>
        <span className="block text-label text-faint">{region}</span>
      </span>
    </div>
  );
}

export function FixtureBar({
  home,
  away,
  standing,
}: {
  readonly home: { club: Club; kit: Kit; region: string };
  readonly away: { club: Club; kit: Kit; region: string };
  /** What the box says. Before kickoff, where it is played; afterwards, the score. */
  readonly standing: React.ReactNode;
}) {
  return (
    <div className="flex items-stretch border-y-2 border-ink">
      <Side club={home.club} kit={home.kit} region={home.region} away={false} />
      <div className="w-[104px] shrink-0 border-x-2 border-ink bg-news-deep grid place-items-center text-center px-1">
        {standing}
      </div>
      <Side club={away.club} kit={away.kit} region={away.region} away />
    </div>
  );
}
