/**
 * **Local scaffolding. This is not part of the schema and must never be migrated.**
 *
 * Supabase provides `auth.uid()` — it reads the caller's JWT claims out of a session setting. The
 * policies in `0004_row_level_security.sql` call it, so testing them anywhere else needs something
 * compatible standing in its place.
 *
 * It lives in `src/`, deliberately **outside `migrations/`**. A copy of `auth.uid()` in the
 * migration set would be applied to the real Supabase database too, where it would shadow theirs
 * with a version that can silently drift from it — and the thing it guards is who may read whose
 * career. Both the tests and the local file-backed database of `pnpm db:seed` stand it up for
 * themselves; nothing that runs against Supabase ever does.
 *
 * Shape taken from Supabase's published definition: the `sub` claim of the request's JWT, as a
 * uuid, or null when there is no session.
 *
 * **Apply it before the migrations, not after.** Postgres resolves `auth.uid()` when a policy is
 * created, so `0004` fails outright without it — which mirrors the real deployment, where
 * Supabase's `auth` schema exists long before your first migration runs. It grants to `public`
 * rather than to `anon` and `authenticated`, because those roles do not exist yet either.
 */
export const SUPABASE_AUTH_SHIM = `
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(
      coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      ),
      ''
    )::uuid;
  $$;
  grant usage on schema auth to public;
`;

/** Becomes that signed-in user for the rest of the transaction. */
export const signIn = (userId: string): string =>
  `set local role authenticated; set local request.jwt.claim.sub = '${userId}';`;

/** A caller with no session at all — the public internet. */
export const signOut = (): string => `set local role anon; set local request.jwt.claim.sub = '';`;
