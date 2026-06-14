-- =====================================================================
-- get_distractors(target uuid, n int default 3)
-- ---------------------------------------------------------------------
-- Canonical reference copy of the dynamic distractor picker.
--
-- WHERE THIS ACTUALLY RUNS: this function is created as part of the schema
-- in migrations/0001_init.sql (Section D). This file is the standalone,
-- documented copy for review and for re-applying in isolation if needed.
-- It is a Postgres SQL function (NOT a Supabase Edge Function) — the
-- `functions/` folder name here is for the get_distractors *helper*, not the
-- Deno edge-runtime. Edge Functions (ML notify, signed URLs) would live in
-- functions/<name>/index.ts.
--
-- CONTRACT: multiple-choice options are selected at RUNTIME, never stored on
-- the item. The controller builds ReviewItem.choices from
--   [target] + get_distractors(target, n)
-- then shuffles and marks `correct`. For 'word/hear' it projects the GLOSS
-- field into choices; for 'word/say' it projects the WORD field. Same picker.
--
-- v1 RULE: same word_class + nearby freq_band (+/- 1), exclude the target,
-- only surfaced content (qa_status <> 'draft'), random sample of n.
--
-- UPGRADE PATH (no migration needed): once semantic_field / phonetic_key are
-- populated, extend the WHERE clause to prefer same-semantic-field (meaning
-- confusions, word/say) or same-phonetic-key (sound confusions, word/hear).
-- =====================================================================

create or replace function public.get_distractors(target uuid, n int default 3)
returns setof public.lemmas
language sql
stable
as $$
  select *
  from public.lemmas
  where id <> target
    and word_class = (select word_class from public.lemmas where id = target)
    and freq_band between
        (select freq_band from public.lemmas where id = target) - 1 and
        (select freq_band from public.lemmas where id = target) + 1
    and qa_status <> 'draft'
  order by random()
  limit n;
$$;
