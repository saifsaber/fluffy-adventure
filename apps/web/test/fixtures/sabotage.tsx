// Not part of the app. This file exists so the guard in `strings.test.ts` can be shown to fail when
// the thing it guards is broken — a scanner that has never caught anything is not known to work.
export function Sabotage() {
  return (
    <section>
      <h1>Full time</h1>
      <p aria-label="Open shots">{'نهاية الماتش'}</p>
      <span className="label">—</span>
      <input placeholder="Minute" />
    </section>
  );
}
