/**
 * The locale union, re-exported from the package that owns it.
 *
 * Deliberately not declared here. ADR-003's guarantees are all `Record<Locale, …>` exhaustiveness
 * checks, and a second copy of the union would make them checks against a different list — the two
 * would agree right up until someone added a language to one of them. `@dakka/ai` owns it because
 * that is the layer that writes the language.
 */
export { DEFAULT_LOCALE, DIRECTION, LOCALES, isLocale, type Locale } from '@dakka/ai';
