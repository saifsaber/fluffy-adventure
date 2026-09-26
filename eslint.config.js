import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': 'warn',
    },
  },
  {
    // Build-time authoring tools run under Node and are expected to report what they wrote.
    files: ['packages/*/scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
    rules: { 'no-console': 'off' },
  },
  {
    /*
     * The client ships one layout for two directions, so a class that names a side of the screen is
     * correct in one locale and wrong in the other — DESIGN.md §6 calls it non-negotiable and the
     * reason is that whoever writes it cannot see the bug, because they are reading in one
     * direction. `apps/web/test/design.test.ts` is the thorough version: it reads the stylesheet
     * too, and it has a sabotage fixture proving the scanner bites. This is the half that arrives
     * while you are still typing.
     */
    files: ['apps/web/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/(^|\\s)-?(ml|mr|pl|pr)-|(^|\\s)-?(left|right)-|(^|\\s)text-(left|right)(\\s|$)|(^|\\s)(border|rounded)-(l|r)(\\s|-|$)/]",
          message:
            'A physical direction in a class name (DESIGN.md §6). Use the logical form: ms-/me-, ps-/pe-, start-/end-, text-start/text-end.',
        },
      ],
    },
  },
  {
    // The engine is a pure package. These are contract violations, not preferences.
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'The engine reads no clock — pass time in as an argument.' },
        { name: 'fetch', message: 'The engine performs no I/O.' },
        { name: 'process', message: 'The engine takes no configuration from the environment.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the injected seeded PRNG. Determinism is the contract.',
        },
      ],
    },
  },
);
