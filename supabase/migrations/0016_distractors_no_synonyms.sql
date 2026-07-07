-- 0016: get_distractors must never return a SYNONYM of the target. The 0012 definition
-- ranks by trigram similarity with no gloss exclusion, so a distractor whose gloss_en
-- equals the target's (e.g. two lemmas both glossed 'house') can appear on a gloss-cued
-- MC card as a second visually-correct option — and since a wrong pick shows red with NO
-- reveal (locked "Try again" UX), the retry feels unwinnable. get_phrase_distractors
-- (0013) already excludes matching glosses via `gloss_en is distinct from`; this aligns
-- the lemma function. Everything else from 0012 is preserved: similarity-first ranking,
-- no hard filters beyond "has a gloss", always fills n slots, pinned empty search_path
-- (0003 hardening), identical signature.
create or replace function public.get_distractors(target uuid, n int default 3)
returns setof public.lemmas
language sql
stable
set search_path = ''
as $function$
  select l.*
  from public.lemmas l,
       (select lemma, gloss_en, word_class, freq_band from public.lemmas where id = target) t
  where l.id <> target
    and l.gloss_en is not null
    and l.gloss_en is distinct from t.gloss_en                        -- never a synonym: it would render as a second "correct" option
  order by
    extensions.similarity(l.lemma, t.lemma) desc,                    -- closest-sounding first
    (l.word_class is not distinct from t.word_class) desc,           -- prefer same word class
    abs(coalesce(l.freq_band, 99) - coalesce(t.freq_band, 99)) asc,  -- then nearest frequency band
    (l.qa_status <> 'draft') desc,                                   -- prefer reviewed words
    l.id                                                             -- deterministic tiebreak
  limit n;
$function$;
