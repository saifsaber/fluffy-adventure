import ts from 'typescript';

/**
 * Finds user-facing strings written into components instead of a locale file (ADR-003 §4).
 *
 * Parsed rather than pattern-matched. A regex over JSX cannot tell `<p>Hello</p>` from the `>` in
 * an arrow function, and a guard with false positives gets switched off within a week — at which
 * point the decision it protects quietly reverts to one locale, which is exactly the failure
 * ADR-003 exists to prevent.
 *
 * It lives in `test/` rather than `src/`: it is a build-time guard that imports the TypeScript
 * compiler, and nothing that large belongs anywhere a bundler might follow it.
 *
 * Three things count as user-facing: JSX text, a string literal used directly as a child, and a
 * string literal given to an attribute a screen reader or a tooltip will read out. A string with no
 * letters in it — an arrow, a dash, a slash — is punctuation and is left alone.
 */

/** Attributes whose literal value reaches a person. `className` and `type` do not. */
const SPOKEN_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'placeholder',
  'title',
]);

export interface HardcodedString {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

const hasLetters = (text: string): boolean => /\p{L}/u.test(text);

export function findHardcodedStrings(file: string, source: string): readonly HardcodedString[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const found: HardcodedString[] = [];

  const report = (node: ts.Node, text: string): void => {
    const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
    found.push({ file, line: line + 1, text: text.trim() });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && hasLetters(node.text)) {
      report(node, node.text);
    } else if (
      ts.isJsxExpression(node) &&
      node.expression !== undefined &&
      (ts.isStringLiteral(node.expression) ||
        ts.isNoSubstitutionTemplateLiteral(node.expression)) &&
      hasLetters(node.expression.text)
    ) {
      report(node, node.expression.text);
    } else if (
      ts.isJsxAttribute(node) &&
      SPOKEN_ATTRIBUTES.has(node.name.getText(parsed)) &&
      node.initializer !== undefined &&
      ts.isStringLiteral(node.initializer) &&
      hasLetters(node.initializer.text)
    ) {
      report(node, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return found;
}
