-- How a competition breaks a tie on points, in order.
--
-- Added the moment the season state machine needed it, which is the point of migrations: the rule
-- differs by football culture — England and Germany go to goal difference, Italy and Spain settle
-- it head-to-head first — so it is a column, not a branch in a standings function.
--
-- A stored competition that cannot say how its table is ordered is a competition whose table has to
-- be ordered by a rule in code, and "a league is data" stops being true the first time that
-- happens. `not null` with no default: every competition states it.
create type tie_break as enum ('goal_difference', 'goals_for', 'wins', 'head_to_head');

alter table competitions add column tie_break tie_break[] not null default '{}';
alter table competitions add constraint tie_break_is_stated check (array_length(tie_break, 1) >= 1);
alter table competitions alter column tie_break drop default;
