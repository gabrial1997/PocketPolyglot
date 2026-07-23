-- 0020: get_distractors must not serve a NEAR-synonym either. 0016 excluded only exact
-- gloss_en equality, but the ranking is trigram similarity on the LEMMA — so for 'labi'
-- (well/okay) the top distractors were 'labs' (good), 'labrīt' (good morning), 'labdien'
-- (good day/hello): every option read as plausible (beta feedback 2026-07-22, the labi MC).
-- Now a candidate is excluded when its gloss shares ANY content token with the target's
-- gloss (lowercased alpha runs, minus a small stopword list) — 'well/now' shares "well",
-- 'good morning' shares "good" once labi's gloss carries good, etc. Distractors then fill
-- from further down the similarity ranking, so n slots still fill (1,000-lemma pool).
-- Everything else from 0016 is preserved: similarity-first ranking, same-word-class and
-- frequency-band preferences, pinned empty search_path, identical signature.
create or replace function public.get_distractors(target uuid, n int default 3)
returns setof public.lemmas
language sql
stable
set search_path = ''
as $function$
  with t as (
    select lemma, gloss_en, word_class, freq_band from public.lemmas where id = target
  ),
  t_toks as (
    -- content tokens of the target gloss ("well/okay/good" -> {well, okay, good})
    select distinct tok
    from t, regexp_split_to_table(lower(t.gloss_en), '[^a-z]+') as tok
    where tok <> ''
      and tok not in ('to','a','the','of','in','on','for','and','or','it','is','be','at','with')
  )
  select l.*
  from public.lemmas l, t
  where l.id <> target
    and l.gloss_en is not null
    and l.gloss_en is distinct from t.gloss_en   -- exact synonym (0016)
    and not exists (                             -- near-synonym: any shared content token
      select 1
      from regexp_split_to_table(lower(l.gloss_en), '[^a-z]+') as ctok
      where ctok <> '' and ctok in (select tok from t_toks)
    )
  order by
    extensions.similarity(l.lemma, t.lemma) desc,                    -- closest-sounding first
    (l.word_class is not distinct from t.word_class) desc,           -- prefer same word class
    abs(coalesce(l.freq_band, 99) - coalesce(t.freq_band, 99)) asc,  -- then nearest frequency band
    (l.qa_status <> 'draft') desc,                                   -- prefer reviewed words
    l.id                                                             -- deterministic tiebreak
  limit n;
$function$;
