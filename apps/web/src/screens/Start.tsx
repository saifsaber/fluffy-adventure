import { useState } from 'react';
import { useT } from '../i18n/context.js';
import type { BrowserLeague } from '../data/league.js';

/**
 * The first decision: which club you are taking over.
 *
 * It is a screen rather than a default because everything after it is derived from it — the
 * fixture list, the board's objective, the table you are read against. Picking one for the player
 * and letting him change it later would mean a career whose history belonged to somebody else.
 */
export function StartScreen({
  league,
  onStart,
}: {
  readonly league: BrowserLeague;
  readonly onStart: (slug: string) => void;
}) {
  const t = useT();
  const first = league.clubs[0];
  const [slug, setSlug] = useState(first?.slug ?? '');

  return (
    <div className="grid gap-6">
      <section className="panel grid gap-4">
        <h2 className="text-h2 font-bold m-0">{t('start.title')}</h2>
        <label className="grid gap-2">
          <span className="label">{t('setup.yourClub')}</span>
          <select className="control" value={slug} onChange={(e) => setSlug(e.target.value)}>
            {league.clubs.map((club) => (
              <option key={club.slug} value={club.slug}>
                {club.shortName}
              </option>
            ))}
          </select>
        </label>
        <p className="text-small text-ink-soft m-0">{t('start.why')}</p>
      </section>

      <button type="button" className="action" onClick={() => onStart(slug)} disabled={slug === ''}>
        {t('start.begin')}
      </button>
    </div>
  );
}
