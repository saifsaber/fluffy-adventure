import type { Club, Tactics } from '@dakka/engine';
import { useT } from '../i18n/context.js';

/**
 * The eleven, as team-sheet rows: zero radius, one hair below, no panel (DESIGN.md §5).
 *
 * The leading column is the **position**, not a shirt number, because players carry no squad
 * number in the data. A programme prints numbers; inventing eleven of them per club would be a
 * fabricated fact wearing a very small costume. The position is true, it is Latin in both locales,
 * and it is the same mark the pitch diagram puts on the shirt.
 *
 * Read-only for now, and the screen says so rather than leaving the player to discover it.
 */
export function TeamSheet({
  club,
  tactics,
  mine,
}: {
  readonly club: Club;
  readonly tactics: Tactics;
  readonly mine: boolean;
}) {
  const t = useT();
  const byId = new Map(club.squad.map((player) => [player.id, player]));
  return (
    <div>
      <ul className="list-none p-0 m-0">
        {tactics.startingXI.map((selection) => {
          const player = byId.get(selection.playerId);
          return (
            <li key={selection.playerId} className={mine ? 'row row-mine' : 'row'}>
              <span className="tech text-figure font-bold w-12 text-center text-faint">
                {selection.position}
              </span>
              <span className="text-small flex-1">{player?.shortName ?? selection.playerId}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-small text-ink-soft mt-3">{t('setup.sheet.auto')}</p>
    </div>
  );
}
