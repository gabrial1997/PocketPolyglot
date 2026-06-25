-- 0012: get_distractors always returns n plausible decoys, ranked "closest available".
-- Prior version filtered hard on (same word_class AND freq_band±1 AND qa_status<>'draft');
-- with the 1000-lemma import all 'draft', that intersection was empty for higher-band words
-- (e.g. kabinets band 7, autobuss band 10) -> 0 distractors -> the MC card showed only the
-- correct answer. New ranking: trigram similarity of the lemma string (Latvian spelling is
-- near-phonemic, so this approximates SOUND similarity) -> same word_class -> nearest freq_band
-- -> prefer reviewed. No hard filters beyond "has a gloss", so it always fills n slots.
create extension if not exists pg_trgm with schema extensions;

create or replace function public.get_distractors(target uuid, n int default 3)
returns setof public.lemmas
language sql
stable
set search_path = ''
as $function$
  select l.*
  from public.lemmas l,
       (select lemma, word_class, freq_band from public.lemmas where id = target) t
  where l.id <> target
    and l.gloss_en is not null
  order by
    extensions.similarity(l.lemma, t.lemma) desc,                    -- closest-sounding first
    (l.word_class is not distinct from t.word_class) desc,           -- prefer same word class
    abs(coalesce(l.freq_band, 99) - coalesce(t.freq_band, 99)) asc,  -- then nearest frequency band
    (l.qa_status <> 'draft') desc,                                   -- prefer reviewed words
    l.id                                                             -- deterministic tiebreak
  limit n;
$function$;
