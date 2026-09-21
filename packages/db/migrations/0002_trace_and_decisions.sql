-- The trace and the decisions, as tables you can ask questions of.
--
-- Blueprint §5: *"`decisions` and `match_traces` are first-class tables, not logs."* The difference
-- is the whole point. A log is a blob you append and read back whole; you cannot ask it which
-- cause has cost this manager the most points, or whether his substitutions have ever been worth
-- anything. One row per moment, with the cause in an enum and the minute indexed, and both of those
-- become a query.
--
-- Storing the trace as JSON on `matches` would have been three lines and would have made the
-- coaching arc impossible to build without a migration later.

create type side as enum ('home', 'away');

-- The closed cause vocabulary, mirroring `CAUSE_REGISTRY` in packages/engine exactly — same
-- spelling, same set. A test compares the two lists, because two enums that must agree and cannot
-- be compared are two enums that will drift, and a cause the engine emits but the database refuses
-- is a match that cannot be saved.
create type cause_tag as enum (
  'HIGH_LINE_VS_PACE', 'DEEP_BLOCK_ABSORBED_PRESSURE', 'MIDFIELD_OVERLOAD', 'MIDFIELD_OUTNUMBERED',
  'WIDE_OVERLOAD', 'NARROW_SHAPE_CONCEDED_FLANKS', 'FORMATION_MISMATCH', 'PRESS_BYPASSED',
  'PRESS_FORCED_TURNOVER', 'COUNTER_ATTACK_EXPOSURE', 'FATIGUE_COLLAPSE', 'FRESH_LEGS_ADVANTAGE',
  'SUBSTITUTION_SWUNG_MOMENTUM', 'MISSED_SUBSTITUTION_WINDOW', 'MENTALITY_SHIFT_PAID_OFF',
  'MENTALITY_SHIFT_BACKFIRED', 'ROLE_MISFIT', 'CLINICAL_FINISHING', 'WASTEFUL_FINISHING',
  'KEEPER_HEROICS', 'KEEPER_ERROR', 'INDIVIDUAL_BRILLIANCE', 'RED_CARD', 'SET_PIECE_ADVANTAGE',
  'SET_PIECE_WEAKNESS', 'HOME_CROWD_LIFT', 'PITCH_CONDITIONS'
);

create type decision_kind as enum (
  'substitution', 'mentality', 'line_height', 'pressing', 'tempo', 'width', 'compactness',
  'role_change'
);

-- ---------------------------------------------------------------------------------------------
-- The trace
-- ---------------------------------------------------------------------------------------------

create table match_traces (
  id bigserial primary key,
  match_id uuid not null references matches (id) on delete cascade,
  minute smallint not null check (minute between 0 and 120),
  cause cause_tag not null,
  -- Signed for the home side, exactly as the engine emits it. Re-signing on the way in would make
  -- the stored row disagree with the trace it came from.
  delta_win_probability double precision not null check (delta_win_probability between -1 and 1),
  favoured side not null
);
-- The index blueprint §5 names. Reading a match back is one ordered scan.
create index match_traces_by_minute on match_traces (match_id, minute);
create index match_traces_by_cause on match_traces (cause);

-- Who a moment was about. A separate table because a moment names zero, one or several players,
-- and an array would make "every moment this player was in" a scan rather than a join.
create table trace_actors (
  trace_id bigint not null references match_traces (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  primary key (trace_id, player_id)
);
create index trace_actors_by_player on trace_actors (player_id);

-- Win probability sampled once a minute, as the engine sampled it. One row per minute rather than
-- an array, so the momentum of a season is a query and not ninety-one numbers to parse.
create table match_win_probability (
  match_id uuid not null references matches (id) on delete cascade,
  minute smallint not null check (minute between 0 and 120),
  home_probability double precision not null check (home_probability between 0 and 1),
  primary key (match_id, minute)
);

-- ---------------------------------------------------------------------------------------------
-- The decisions
-- ---------------------------------------------------------------------------------------------

-- What the manager changed, when, and on which side. The shape of a decision depends on its kind,
-- and the check below is what stops a half-built one being stored: a substitution without the two
-- players is not a substitution, and a change of mentality with players attached is a row nobody
-- can read back into an `InMatchDecision`.
create table decisions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  career_id uuid not null references careers (id) on delete cascade,
  side side not null,
  minute smallint not null check (minute between 1 and 120),
  kind decision_kind not null,
  /** The new setting, for a decision that turns a dial. Null for a substitution. */
  to_value text,
  player_off uuid references players (id),
  player_on uuid references players (id),
  position position_code,
  role role_code,
  created_at timestamptz not null default now(),
  constraint decision_shape_matches_its_kind check (
    case kind
      when 'substitution' then
        player_off is not null and player_on is not null
        and position is not null and role is not null
        and to_value is null
      when 'role_change' then
        player_on is not null and role is not null and to_value is null
        and player_off is null
      else
        to_value is not null
        and player_off is null and player_on is null and position is null and role is null
    end
  )
);
create index decisions_by_match on decisions (match_id, minute);
create index decisions_by_career on decisions (career_id, created_at desc);

-- What a decision turned out to be worth, measured rather than asserted.
--
-- A paired difference over `runs` replays of the same match with and without the decision, carrying
-- its own standard error. **There is no `significant` column**: significance is a conclusion drawn
-- from the delta and the error at a chosen threshold, and a stored conclusion drifts away from the
-- numbers it came from. Store the measurement; decide in code.
--
-- `engine_version` because a rebalanced engine values the same decision differently, so a valuation
-- that does not say which engine produced it is a number with no cause behind it.
create table decision_valuations (
  decision_id uuid primary key references decisions (id) on delete cascade,
  runs integer not null check (runs > 0),
  engine_version text not null,
  points_delta double precision not null,
  points_stderr double precision not null check (points_stderr >= 0),
  goals_for_delta double precision not null,
  goals_for_stderr double precision not null check (goals_for_stderr >= 0),
  goals_against_delta double precision not null,
  goals_against_stderr double precision not null check (goals_against_stderr >= 0),
  computed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- All of it is history
-- ---------------------------------------------------------------------------------------------

create trigger traces_are_history
  before update or delete on match_traces
  for each row execute function refuse_rewrite();

create trigger win_probability_is_history
  before update or delete on match_win_probability
  for each row execute function refuse_rewrite();

create trigger decisions_are_history
  before update or delete on decisions
  for each row execute function refuse_rewrite();
