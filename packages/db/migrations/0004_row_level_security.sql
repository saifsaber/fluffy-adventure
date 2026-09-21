-- Row-level security: the database refuses, not the application.
--
-- Blueprint and the box both name the failure mode exactly — *"faking it looks like filtering by
-- `career_id` in application code only."* A `where career_id = $1` in a handler is a rule that
-- holds until someone writes a query without it, and the first person to do that will not be the
-- one who reads this file. Below, a `select * from matches` with no `where` clause returns your
-- matches and nobody else's, because Postgres will not hand over the other rows.
--
-- The policies reference `auth.uid()`, which Supabase provides. This migration deliberately does
-- **not** define it: a copy here would be applied to the real Supabase database too, shadowing
-- theirs with a version that can silently drift — and what it decides is who may read whose
-- career. `src/local-auth.ts` stands up a compatible one for the tests and for the local
-- file-backed database, outside `migrations/` where it cannot be deployed by accident.
--
-- **Order matters:** Postgres resolves `auth.uid()` when a policy is created, so that schema has to
-- exist before this file runs. On Supabase it always does.

-- Supabase ships these roles; any other Postgres needs them. Guarded so this migration is
-- self-contained without fighting an existing installation.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The content is the league. Everyone reads it; nobody writes it through the API.
-- ---------------------------------------------------------------------------------------------

grant select on competitions, competition_entries, clubs, players to anon, authenticated;

alter table competitions enable row level security;
alter table competition_entries enable row level security;
alter table clubs enable row level security;
alter table players enable row level security;

create policy content_is_public_competitions on competitions for select to anon, authenticated using (true);
create policy content_is_public_entries on competition_entries for select to anon, authenticated using (true);
create policy content_is_public_clubs on clubs for select to anon, authenticated using (true);
create policy content_is_public_players on players for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------------------------
-- A career, and everything hanging off it, belongs to one person
-- ---------------------------------------------------------------------------------------------

grant select on users to authenticated;
grant select, insert on managers, careers, seasons, squads, tactics, fixtures, matches to authenticated;
grant select, insert on decisions, match_traces, trace_actors, match_win_probability to authenticated;
grant select, insert on decision_valuations, player_attributes to authenticated;
grant usage on all sequences in schema public to authenticated;

alter table users enable row level security;
alter table users force row level security;
create policy you_are_yourself on users
  for select to authenticated using (id = auth.uid());

alter table managers enable row level security;
alter table managers force row level security;
create policy your_managers on managers
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- One helper, so every policy below says the same thing the same way. A career is yours when its
-- manager is yours; everything else is that question asked one join further out.
create function owns_career(target uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from careers c join managers m on m.id = c.manager_id
     where c.id = target and m.user_id = auth.uid()
  );
$$;

alter table careers enable row level security;
alter table careers force row level security;
create policy your_careers on careers
  for all to authenticated
  using (exists (select 1 from managers m where m.id = manager_id and m.user_id = auth.uid()))
  with check (exists (select 1 from managers m where m.id = manager_id and m.user_id = auth.uid()));

alter table seasons enable row level security;
alter table seasons force row level security;
create policy your_seasons on seasons
  for all to authenticated using (owns_career(career_id)) with check (owns_career(career_id));

alter table squads enable row level security;
alter table squads force row level security;
create policy your_squads on squads
  for all to authenticated using (owns_career(career_id)) with check (owns_career(career_id));

alter table tactics enable row level security;
alter table tactics force row level security;
create policy your_tactics on tactics
  for all to authenticated using (owns_career(career_id)) with check (owns_career(career_id));

alter table matches enable row level security;
alter table matches force row level security;
create policy your_matches on matches
  for all to authenticated using (owns_career(career_id)) with check (owns_career(career_id));

alter table decisions enable row level security;
alter table decisions force row level security;
create policy your_decisions on decisions
  for all to authenticated using (owns_career(career_id)) with check (owns_career(career_id));

-- A fixture belongs to a season, which belongs to a career.
alter table fixtures enable row level security;
alter table fixtures force row level security;
create policy your_fixtures on fixtures
  for all to authenticated
  using (exists (select 1 from seasons s where s.id = season_id and owns_career(s.career_id)))
  with check (exists (select 1 from seasons s where s.id = season_id and owns_career(s.career_id)));

-- The trace belongs to the match it explains. Reachability, not a second copy of ownership.
create function owns_match(target uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches m where m.id = target and owns_career(m.career_id));
$$;

alter table match_traces enable row level security;
alter table match_traces force row level security;
create policy your_traces on match_traces
  for all to authenticated using (owns_match(match_id)) with check (owns_match(match_id));

alter table match_win_probability enable row level security;
alter table match_win_probability force row level security;
create policy your_win_probability on match_win_probability
  for all to authenticated using (owns_match(match_id)) with check (owns_match(match_id));

alter table trace_actors enable row level security;
alter table trace_actors force row level security;
create policy your_trace_actors on trace_actors
  for all to authenticated
  using (exists (select 1 from match_traces t where t.id = trace_id and owns_match(t.match_id)))
  with check (exists (select 1 from match_traces t where t.id = trace_id and owns_match(t.match_id)));

alter table decision_valuations enable row level security;
alter table decision_valuations force row level security;
create policy your_valuations on decision_valuations
  for all to authenticated
  using (exists (select 1 from decisions d where d.id = decision_id and owns_career(d.career_id)))
  with check (exists (select 1 from decisions d where d.id = decision_id and owns_career(d.career_id)));

-- Attribute history is two things in one table, and the split is the point: the dataset baseline
-- is the league and everyone reads it; a career's own progression is that career's alone.
alter table player_attributes enable row level security;
alter table player_attributes force row level security;
grant select on player_attributes to anon;
create policy baseline_is_public on player_attributes
  for select to anon, authenticated using (career_id is null);
create policy your_attribute_history on player_attributes
  for all to authenticated
  using (career_id is not null and owns_career(career_id))
  with check (career_id is not null and owns_career(career_id));
