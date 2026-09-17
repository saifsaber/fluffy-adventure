import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_LOCALE, DIRECTION, isLocale, translator } from './index.js';
import type { Locale, Translate } from './index.js';

const STORAGE_KEY = 'dakka.locale';

interface LocaleValue {
  readonly locale: Locale;
  readonly dir: 'rtl' | 'ltr';
  readonly setLocale: (locale: Locale) => void;
  readonly t: Translate;
}

const LocaleContext = createContext<LocaleValue | null>(null);

function stored(): Locale | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    // A blocked storage API is not a reason to fail to render.
    return null;
  }
}

export function LocaleProvider({
  children,
  initial,
}: {
  readonly children: ReactNode;
  readonly initial?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => initial ?? stored() ?? DEFAULT_LOCALE);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Same: the choice just does not survive a reload.
    }
  }, []);

  // `dir` and `lang` live on the document element, set from the locale and nowhere else. This is
  // the single switch that makes one layout serve both directions.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = DIRECTION[locale];
  }, [locale]);

  const value = useMemo<LocaleValue>(
    () => ({ locale, dir: DIRECTION[locale], setLocale, t: translator(locale) }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (value === null) throw new Error('useLocale must be used inside a LocaleProvider');
  return value;
}

export function useT(): Translate {
  return useLocale().t;
}
