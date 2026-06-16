-- =====================================================================
-- PocketPolyglot — 0006_distractors_null_band.sql
-- Fix: get_distractors returned ZERO rows for a target lemma whose freq_band
-- is NULL. The band window `freq_band between NULL-1 and NULL+1` evaluates to
-- NULL (never true), so a target with no frequency band got no distractors at
-- all — the choose-stage card then renders with nothing to pick.
--
-- Fix: when the target's freq_band is NULL, skip the band window entirely and
-- fall back to any same-word_class, non-draft lemma. When the target HAS a band,
-- behaviour is unchanged. Keeps the pinned empty search_path and the fully
-- schema-qualified body from 0003.
-- =====================================================================

create or replace function public.get_distractors(target uuid, n int default 3)
returns setof public.lemmas
language sql
stable
set search_path = ''
as $$
  select *
  from public.lemmas
  where id <> target
    and word_class = (select word_class from public.lemmas where id = target)
    and (
      -- No band on the target → don't let the NULL window exclude every row.
      (select freq_band from public.lemmas where id = target) is null
      or freq_band between
          (select freq_band from public.lemmas where id = target) - 1 and
          (select freq_band from public.lemmas where id = target) + 1
    )
    and qa_status <> 'draft'
  order by random()
  limit n;
$$;
