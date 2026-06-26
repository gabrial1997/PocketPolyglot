-- Per-template FSRS scheduling: each quiz template ('recognition'|'pronunciation') gets its own
-- review_state row + schedule. Non-breaking: all existing rows backfill to 'recognition', and
-- known_lemmas keeps identical behaviour (it now explicitly filters the recognition template).

alter table public.review_state
  add column if not exists template text not null default 'recognition';

alter table public.review_state
  add constraint review_state_template_chk
  check (template in ('recognition', 'pronunciation'));

-- Widen the primary key to include template so (item) can carry independent schedules.
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
