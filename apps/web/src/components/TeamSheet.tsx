import type { Club, Tactics } from '@dakka/engine';
import { useT } from '../i18n/context.js';

/**
 * The eleven, as team-sheet rows: zero radius, one hairline, no card (DESIGN.md §5).
 *
 * Read-only for now, and the screen says so rather than leaving the player to discover it. The
 * position is a Latin technical term and stays Latin in both locales.
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
      <p className="label mb-2">{t('setup.sheet')}</p>
      <ul className="list-none p-0 m-0">
        {tactics.startingXI.map((selection) => {
          const player = byId.get(selection.playerId);
          return (
            <li key={selection.playerId} className={mine ? 'row row-mine' : 'row'}>
              <span className="tech text-small w-12 text-center text-faint">
                {selection.position}
              </span>
              <span className="flex-1">{player?.shortName ?? selection.playerId}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-small text-ink-soft mt-3">{t('setup.sheet.auto')}</p>
    </div>
  );
}
