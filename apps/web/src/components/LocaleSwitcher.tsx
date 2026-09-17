import { LOCALES } from '../i18n/index.js';
import { useLocale } from '../i18n/context.js';

/**
 * Both languages, each named in itself.
 *
 * Part of the thinnest UI rather than a setting hidden later: a second locale nobody can reach is a
 * second locale nobody tests, and ADR-003 exists precisely because that is how two locales quietly
 * become one.
 */
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div role="group" aria-label={t('locale.switcher')} className="flex gap-2">
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          className="button-quiet text-small"
          aria-pressed={option === locale}
          onClick={() => setLocale(option)}
        >
          {t(option === 'ar-EG' ? 'locale.ar-EG' : 'locale.en')}
        </button>
      ))}
    </div>
  );
}
