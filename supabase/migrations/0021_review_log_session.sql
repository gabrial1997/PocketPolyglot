-- 0021: session stamping for the earned-phrase gate (spec 2026-07-23).
-- A "round" = one app session. Earned = correct recognition in a DIFFERENT round
-- (or later day) than intro. Nullable, no backfill: legacy rows fall back to the
-- later-day rule in computeEarned.
alter table public.review_log add column if not exists session_id uuid;
-- Paged earned/intro queries walk (user_id, card_kind, created_at).
create index if not exists review_log_user_kind_created_idx
  on public.review_log (user_id, card_kind, created_at);
