-- Per-template FSRS scheduling: each quiz template ('recognition'|'pronunciation') gets its own
-- review_state row + schedule. Non-breaking: all existing rows backfill to 'recognition', and
-- known_lemmas keeps identical behaviour (it now explicitly filters the recognition template).

alter table public.review_state
  add column if not exists template text not null default 'recognition';

alter table public.review_state
  add constraint review_state_template_chk
  check (template in ('recognition', 'pronunciation'));

-- Widen the primary key to include template so (item) can carry independent schedules.
-- NB: this rebuilds the PK index under an ACCESS EXCLUSIVE lock (a plain ADD CONSTRAINT ...
-- PRIMARY KEY, not `CREATE INDEX CONCURRENTLY`, which cannot run inside a transaction block —
-- and Supabase applies each migration file as one transaction). Acceptable now: review_state is
-- still beta-scale (a handful of test accounts). Before this ever runs against a large/live
-- table, do the widening out-of-band instead: `create unique index concurrently` on the new key,
-- then `alter table ... add constraint ... primary key using index` to swap onto it (brief lock).
alter table public.review_state drop constraint review_state_pkey;
alter table public.review_state
  add constraint review_state_pkey
  primary key (user_id, item_type, item_id, template);

-- known_lemmas: a lemma is "known" once its RECOGNITION schedule reaches review/mature.
-- (Pronunciation maturity does not gate phrase unlocks.) Behaviour is unchanged because every
-- pre-existing row is now template='recognition'. CREATE OR REPLACE (not drop) keeps the
-- dependent user_coverage view intact — the output columns (user_id, lemma_id) are unchanged.
create or replace view public.known_lemmas
  with (security_invoker = true) as
  select user_id, item_id as lemma_id
  from public.review_state
  where item_type = 'lemma'
    and template = 'recognition'
    and stage in ('review', 'mature');
