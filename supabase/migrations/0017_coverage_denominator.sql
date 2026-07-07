-- 0017: user_coverage's denominator must match the universe the scheduler actually SERVES.
-- The 0001 view counted only qa_status <> 'draft' lemmas in total_count, but qa_status is
-- editorial PROVENANCE, not a serving gate: SupabaseSrsService.lemmaCandidates() explicitly
-- does NOT filter on qa_status ("serve drafts per spec"), and the 1000-lemma import is all
-- 'draft' (see 0012's note). Result: the Progress screen's denominator was 0 ("N of the 0
-- most common words") while known_count grew. Align total_count to ALL lemmas — the same
-- universe serving draws from and the same universe known_lemmas (0014, also no qa_status
-- filter) feeds the numerator from, so known_count/total_count can never disagree about
-- which lemmas "count". Output columns (user_id, known_count, total_count) and the
-- security_invoker setting are unchanged, so CREATE OR REPLACE is safe.
create or replace view public.user_coverage
  with (security_invoker = true) as
  select
    k.user_id,
    count(distinct k.lemma_id) as known_count,
    (select count(*) from public.lemmas) as total_count
  from public.known_lemmas k
  group by k.user_id;
