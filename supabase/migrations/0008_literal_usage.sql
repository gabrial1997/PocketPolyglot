-- =====================================================================
-- PocketPolyglot — 0008_literal_usage.sql
-- Some words/phrases read differently word-for-word than they function
-- (e.g. kā = literally "like/as" but used as "how"). Add two nullable
-- text columns to lemmas + phrases to carry that note:
--   literal_gloss — the literal / word-for-word reading
--   usage_note    — a short freeform usage nuance
-- Both nullable; rows with no literal/actual gap simply leave them null.
-- No data backfill here — the golden-slice seeder populates them.
-- =====================================================================

alter table public.lemmas
  add column if not exists literal_gloss text,
  add column if not exists usage_note text;

alter table public.phrases
  add column if not exists literal_gloss text,
  add column if not exists usage_note text;
