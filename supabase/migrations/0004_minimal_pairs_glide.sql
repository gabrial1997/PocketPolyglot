-- =====================================================================
-- PocketPolyglot — 0004_minimal_pairs_glide.sql
-- ---------------------------------------------------------------------
-- Adds minimal_pairs.glide (jsonb) for diphthong-contrast drills.
--
-- The new `ie` diphthong drill (and future glide drills) carry a
-- { combo, from, to } descriptor (e.g. { "combo": "ie", "from": "i", "to": "e" })
-- so the GlideTrack UI can animate the i->e glide. Plain palatalization
-- minimal pairs (L vs Ļ) leave this NULL.
--
-- Consumed by mappers.ts (pairRowToReviewItem -> ReviewItem.glide) and seeded
-- by content-pipeline/seed-golden-slice.mjs.
-- =====================================================================

alter table public.minimal_pairs add column if not exists glide jsonb;
