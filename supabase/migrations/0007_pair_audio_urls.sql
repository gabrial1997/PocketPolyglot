-- =====================================================================
-- PocketPolyglot — 0007_pair_audio_urls.sql
-- minimal_pairs carried only ONE audio_url (the stimulus). The diphthong
-- "meet the glide" step needs an isolated-glide clip, and per-option
-- playback needs each side's own clip. Add three nullable url columns:
--   glide_audio_url — isolated glide sound (diphthong drills only)
--   a_audio_url     — clip of side `a`
--   b_audio_url     — clip of side `b`
-- All nullable; existing rows + non-diphthong pairs simply leave them null.
-- No data backfill here — the golden-slice seeder populates them.
-- =====================================================================

alter table public.minimal_pairs
  add column if not exists glide_audio_url text,
  add column if not exists a_audio_url text,
  add column if not exists b_audio_url text;
