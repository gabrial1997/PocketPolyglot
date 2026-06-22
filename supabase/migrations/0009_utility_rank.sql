-- =====================================================================
-- PocketPolyglot — 0009_utility_rank.sql
-- The scheduler (Module B) orders new candidates by phrase-utility rank.
-- utility_rank bakes in final_score = 0.6·utility + 0.4·freq (the phrase-
-- utility overlay), so it is the spec-correct new-item ordering with no
-- separate re-rank in code. Nullable now; the content importer
-- (content-pipeline/seed-content.mjs) populates it 1..1000.
-- =====================================================================
alter table public.lemmas add column if not exists utility_rank integer;
create index if not exists lemmas_utility_rank_idx on public.lemmas (utility_rank);
