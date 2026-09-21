-- Core tables: identity, a career, the content it is played over, and the matches it produces.
--
-- Normalised, not a JSON blob. The competitor keeps a 1.2 MB career in `localStorage`, which cannot
-- be queried, shared, leaderboarded or recovered — blueprint §5 exists to correct exactly that, and
-- every table below is a place a question can be asked.
--
-- Two rules are enforced here rather than documented:
--   * **Historical data is append-only.** A played match and a recorded attribute cannot be edited
--     or deleted. A trigger raises; a comment would not.
--   * **A league is data.** Points, round-robin count and promotion places are columns. If adding a
--     country ever needs a code change, this schema is wrong (global-strategy §8.4).

-- ---------------------------------------------------------------------------------------------
-- Types. A bad value is a constraint violation, the way a bad `Position` is a build error in TS.
-- ---------------------------------------------------------------------------------------------

create type position_code as enum (
  'GK', 'RB', 'LB', 'CB', 'RWB', 'LWB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST', 'CF'
);

-- Read off `roleSchema` in packages/content, not written from memory. The first version of this
-- file was written from memory and invented four roles while missing `touchline_winger`, which
-- the very first insert of real content rejected. A test now compares the two lists.
create type role_code as enum (
  'sweeper_keeper', 'shot_stopper', 'ball_playing_defender', 'stopper', 'covering_defender',
  'attacking_fullback', 'inverted_fullback', 'defensive_fullback', 'anchor',
  'deep_lying_playmaker', 'box_to_box', 'ball_winner', 'advanced_playmaker', 'shadow_striker',
  'inside_forward', 'touchline_winger', 'target_man', 'poacher', 'false_nine',
  'complete_forward'
);

create type mentality as enum (
  'ultra_defensive', 'defensive', 'balanced', 'attacking', 'ultra_attacking'
);
create type line_height as enum ('deep', 'normal', 'high', 'very_high');
create type pressing_intensity as enum ('contain', 'moderate', 'high', 'gegenpress');
create type tempo as enum ('slow', 'balanced', 'fast');
create type team_width as enum ('narrow', 'balanced', 'wide');
create type compactness as enum ('tight', 'balanced', 'loose');

create type squad_slot as enum ('xi', 'bench');
create type career_status as enum ('active', 'ended');
create type season_status as enum ('scheduled', 'running', 'complete');
create type fixture_status as enum ('scheduled', 'played', 'abandoned');

-- Why a row of attribute history exists. `content` is the dataset baseline a career starts from.
create type attribute_source as enum ('content', 'training', 'match', 'ageing');

-- The 29 attributes `playerSchema` actually carries, keeper attributes included, spelled exactly
-- as the content spells them so the mapping is identity and there is nowhere for a typo to hide.
create type attribute_code as enum (
  'finishing', 'longShots', 'passing', 'vision', 'crossing', 'dribbling', 'firstTouch',
  'heading', 'tackling', 'marking', 'pace', 'acceleration', 'strength', 'stamina', 'agility',
  'jumping', 'positioning', 'decisions', 'composure', 'workRate', 'aggression', 'anticipation',
  'teamwork', 'leadership', 'handling', 'reflexes', 'aerialReach', 'distribution', 'oneOnOnes'
);

-- ---------------------------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------------------------

-- Auth lives in Supabase and this row is a foreign key into it, deliberately holding **no
-- credential of its own** — no email, no password hash, no token. A second copy of a secret is a
-- second place to leak it, and this repository is public.
create table users (
  id uuid primary key,
  created_at timestamptz not null default now()
);

create table managers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  created_at timestamptz not null default now()
);
create index managers_by_user on managers (user_id);

-- ---------------------------------------------------------------------------------------------
-- Content: the league, its clubs, its players. Mirrors the files in packages/content.
-- ---------------------------------------------------------------------------------------------

create table competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text not null,
  country char(3) not null,
  tier smallint not null check (tier between 1 and 10),
  -- Every rule that differs between football cultures is a column. A branch on country here would
  -- mean the schema is missing a field.
  round_robin smallint not null check (round_robin between 1 and 4),
  promotion_automatic smallint not null default 0 check (promotion_automatic >= 0),
  promotion_playoff smallint not null default 0 check (promotion_playoff >= 0),
  relegation_automatic smallint not null default 0 check (relegation_automatic >= 0),
  points_win smallint not null,
  points_draw smallint not null,
  points_loss smallint not null
);

create table clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text not null,
  country char(3) not null,
  region text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  reputation smallint not null check (reputation between 1 and 99),
  stadium_name text not null,
  stadium_slug text not null,
  stadium_capacity integer not null check (stadium_capacity >= 100),
  pitch_quality smallint not null check (pitch_quality between 1 and 99),
  -- Authored content, validated in `packages/content` before it ever reaches here. Stored as the
  -- same lowercase hex so a colour cannot acquire a second spelling.
  kit_primary char(7) not null check (kit_primary ~ '^#[0-9a-f]{6}$'),
  kit_secondary char(7) not null check (kit_secondary ~ '^#[0-9a-f]{6}$')
);

create table competition_entries (
  competition_id uuid not null references competitions (id) on delete cascade,
  club_id uuid not null references clubs (id) on delete cascade,
  primary key (competition_id, club_id)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  slug text not null unique,
  name text not null,
  short_name text not null,
  nickname text,
  age smallint not null check (age between 15 and 45),
  nationality char(3) not null,
  positions position_code[] not null check (array_length(positions, 1) >= 1),
  preferred_roles role_code[] not null check (array_length(preferred_roles, 1) >= 1)
);
create index players_by_club on players (club_id);

-- One row per attribute per version, never a wide row rewritten in place.
--
-- This shape is what "progression is inspectable" means: *his finishing went 62 → 64, on this date,
-- for this reason* is one query. A wide table updated in place answers what he is and destroys how
-- he got there, which is the same failure as a statistic with no cause behind it.
--
-- `career_id` is null for the dataset baseline, which every career starts from and none owns.
create table player_attributes (
  id bigserial primary key,
  player_id uuid not null references players (id) on delete cascade,
  career_id uuid,
  attribute attribute_code not null,
  value smallint not null check (value between 1 and 99),
  source attribute_source not null,
  valid_from timestamptz not null default now()
);
create index player_attributes_history on player_attributes (player_id, attribute, valid_from desc);

-- ---------------------------------------------------------------------------------------------
-- A career, and what happens inside it
-- ---------------------------------------------------------------------------------------------

create table careers (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references managers (id) on delete cascade,
  club_id uuid not null references clubs (id),
  competition_id uuid not null references competitions (id),
  -- The engine that produced every match in this career. A rebalanced engine resolves the same
  -- seed differently, so a career that does not record its version cannot honestly be replayed.
  engine_version text not null,
  status career_status not null default 'active',
  started_at timestamptz not null default now()
);
create index careers_by_manager on careers (manager_id, started_at desc);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  career_id uuid not null references careers (id) on delete cascade,
  competition_id uuid not null references competitions (id),
  ordinal smallint not null check (ordinal >= 1),
  status season_status not null default 'scheduled',
  unique (career_id, ordinal)
);
create index seasons_by_career on seasons (career_id, id);

-- The career's selection for a club: who is in the eleven, who is on the bench, and where.
create table squads (
  career_id uuid not null references careers (id) on delete cascade,
  club_id uuid not null references clubs (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  position position_code not null,
  role role_code not null,
  slot squad_slot not null,
  primary key (career_id, club_id, player_id)
);
create index squads_by_career on squads (career_id, club_id);

create table tactics (
  id uuid primary key default gen_random_uuid(),
  career_id uuid not null references careers (id) on delete cascade,
  club_id uuid not null references clubs (id) on delete cascade,
  mentality mentality not null,
  line_height line_height not null,
  pressing_intensity pressing_intensity not null,
  tempo tempo not null,
  width team_width not null,
  compactness compactness not null,
  created_at timestamptz not null default now()
);
create index tactics_by_career on tactics (career_id, created_at desc);

create table fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  competition_id uuid not null references competitions (id),
  round smallint not null check (round >= 1),
  home_club_id uuid not null references clubs (id),
  away_club_id uuid not null references clubs (id),
  status fixture_status not null default 'scheduled',
  scheduled_for timestamptz,
  check (home_club_id <> away_club_id),
  unique (season_id, round, home_club_id)
);
create index fixtures_by_season on fixtures (season_id, round);

create table matches (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null unique references fixtures (id) on delete cascade,
  career_id uuid not null references careers (id) on delete cascade,
  season_id uuid not null references seasons (id) on delete cascade,
  -- The two columns the whole product rests on. With them any match in history can be
  -- re-simulated or re-explained; without them a stored result is a claim nobody can check.
  seed text not null check (length(seed) > 0),
  engine_version text not null,
  home_score smallint not null check (home_score >= 0),
  away_score smallint not null check (away_score >= 0),
  home_tactics_id uuid references tactics (id),
  away_tactics_id uuid references tactics (id),
  played_at timestamptz not null default now()
);
create index matches_by_career_season on matches (career_id, season_id);
create index matches_by_career_recent on matches (career_id, played_at desc);

-- ---------------------------------------------------------------------------------------------
-- Append-only, enforced
-- ---------------------------------------------------------------------------------------------

-- Rewriting history and erasing it are different acts, and only one of them is ever legitimate.
--
-- An UPDATE is always refused: editing a result would silently change what the product says
-- happened, and the counterfactual and the coaching arc are both built on the assumption that it
-- cannot. A DELETE is refused too — *unless the transaction has said out loud that it is erasing*.
--
-- That escape hatch is not a weakening. Without it the first version of this trigger made deleting
-- an account impossible, because the cascade from `users` has to delete these rows: a person asking
-- to be forgotten would have been told no by a rule meant to stop someone editing a scoreline. The
-- flag makes erasure an explicit, greppable act rather than a side effect, and the honest default
-- for everything else stays refusal.
create function refuse_rewrite() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('dakka.erasing', true), 'off') = 'on' then
    return old;
  end if;
  raise exception
    'table % is append-only: % is not allowed (set dakka.erasing to erase an account)',
    tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;
create trigger matches_are_history
  before update or delete on matches
  for each row execute function refuse_rewrite();

create trigger attribute_history_is_history
  before update or delete on player_attributes
  for each row execute function refuse_rewrite();
