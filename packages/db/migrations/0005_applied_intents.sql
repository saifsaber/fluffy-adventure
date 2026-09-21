-- What the server has already taken.
--
-- The queue on the client is safe to re-send: a lost acknowledgement looks exactly like a lost
-- request, and a client that cannot tell the difference has to retry. Without this table a retry
-- plays the match a second time, and the career quietly gains a fixture nobody played.
--
-- The id is the client's own, minted when the intent was created — not the server's, because the
-- whole point is that the *same* intent arriving twice is recognisable as the same intent.
--
-- A uuid, and the type is the constraint: a client numbering its intents 1, 2, 3 would collide with
-- every other client, and the second player's match would be swallowed as *already applied*. Two
-- devices must be able to mint ids without talking to each other or to us.
create table applied_intents (
  id uuid primary key,
  career_id uuid not null references careers (id) on delete cascade,
  kind text not null,
  applied_at timestamptz not null default now()
);
create index applied_intents_by_career on applied_intents (career_id, applied_at desc);

alter table applied_intents enable row level security;
alter table applied_intents force row level security;
grant select, insert on applied_intents to authenticated;
create policy your_applied_intents on applied_intents
  for all to authenticated using (owns_career(career_id)) with check (owns_career(career_id));

-- History, like everything else it records.
create trigger applied_intents_are_history
  before update or delete on applied_intents
  for each row execute function refuse_rewrite();
