-- The content baseline goes in exactly once, however many times the seed is run.
--
-- Discovered while building `pnpm db:seed`, which is what a migration is for: `player_attributes`
-- is append-only, so the usual idempotence trick — `on conflict do update` — is refused by the
-- trigger, and a second run without a constraint would simply append a duplicate baseline. Both
-- failures are silent in their own way, and neither is acceptable in a command people re-run.
--
-- A partial unique index gives the seed an `on conflict do nothing` that needs no UPDATE: one
-- baseline row per player per attribute, and only for the dataset baseline. A career's own history
-- is deliberately outside it — the whole point of that table is that a player's finishing can be
-- recorded many times as it changes.
create unique index player_attribute_baseline_is_unique
  on player_attributes (player_id, attribute)
  where career_id is null and source = 'content';
