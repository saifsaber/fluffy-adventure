/**
 * Numbers, formatted the same way in both locales.
 *
 * Deliberately not `Intl.NumberFormat`: asked for `ar-EG` it produces Arabic-Indic digits, and
 * `dakka-arabic-voice` rule 2 says Egyptian football writing uses Latin digits. Going through Intl
 * "properly" would therefore break the copy, so the formatting is explicit and locale-free, and one
 * number component serves both languages.
 */

export const int = (value: number): string => String(Math.round(value));

export const dec = (value: number, places: number): string => value.toFixed(places);

/** A difference always carries its sign, because an unsigned difference reads as a total. */
export const signed = (value: number, places: number): string =>
  `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(places)}`;

export const percent = (part: number, whole: number): string =>
  whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;

/** `mean ± 2se`, the only honest way to quote a measured difference. */
export const withSpread = (mean: number, standardError: number, places: number): string =>
  `${signed(mean, places)} ± ${dec(2 * standardError, places)}`;
