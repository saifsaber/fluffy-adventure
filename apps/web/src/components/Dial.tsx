import type { MessageKey } from '../i18n/index.js';
import { useT } from '../i18n/context.js';

/**
 * One tactical choice, as a group of buttons rather than a select.
 *
 * A select hides the alternatives behind a tap, and the alternatives are the decision. Every option
 * is a 44px target and the group carries its own accessible name, so the choice reads the same to a
 * screen reader as it does on the screen.
 */
export function Dial<T extends string>({
  label,
  value,
  options,
  optionKey,
  onChange,
}: {
  readonly label: MessageKey;
  readonly value: T;
  readonly options: readonly T[];
  readonly optionKey: (option: T) => MessageKey;
  readonly onChange: (next: T) => void;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={t(label)}>
      <p className="label mb-2">{t(label)}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className="button-quiet text-small"
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {t(optionKey(option))}
          </button>
        ))}
      </div>
    </div>
  );
}
