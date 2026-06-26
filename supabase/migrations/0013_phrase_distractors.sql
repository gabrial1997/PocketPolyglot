-- 0013: distractor pool for the phrase meaning-quiz (phrase/meaning). Returns n OTHER phrases whose
-- gloss_en serves as wrong options. "More confusable": phrases sharing a component lemma with the
-- target rank first, then random. Excludes the target and any phrase whose gloss equals the
-- target's (so no duplicate/correct option leaks in). Requires a non-empty gloss.
-- NB: the param is `target_id` (not `target`) because phrases HAS a `target` column (the phrase
-- text) — a `target` param would shadow it and break `id = target` with a uuid=text error.
create or replace function public.get_phrase_distractors(target_id uuid, n int default 3)
returns setof public.phrases
language sql
stable
set search_path = ''
as $function$
  with t as (
    select gloss_en from public.phrases where id = target_id
  ),
  t_components as (
    select lemma_id from public.phrase_components where phrase_id = target_id
  )
  select p.*
  from public.phrases p
  where p.id <> target_id
    and coalesce(trim(p.gloss_en), '') <> ''
    and p.gloss_en is distinct from (select gloss_en from t)
  order by
    (select count(*) from public.phrase_components pc
       where pc.phrase_id = p.id
         and pc.lemma_id in (select lemma_id from t_components)) desc,  -- shared components first
    random()
  limit n;
$function$;
