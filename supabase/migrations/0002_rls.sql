-- =====================================================================
-- PocketPolyglot — 0002_rls.sql  (DRAFT — NOT YET APPLIED)
-- ---------------------------------------------------------------------
-- Row-Level Security + GDPR gating + the private recordings Storage bucket.
-- Kept separate from 0001 on purpose so the security surface is auditable
-- in one place (CTO/QA pass).
--
-- POLICY MODEL (from database-schema-seed.md §6):
--   CONTENT tables   : SELECT for `authenticated`; ALL writes -> `service_role` only.
--   USER tables      : auth.uid() = user_id for ALL operations.
--   recordings INSERT: additionally gated on profiles.rec_consent = true.
--   recordings bucket: private; signed-URL access only; RLS mirrors the table.
--
-- Note: `service_role` bypasses RLS entirely in Supabase, so it does not need
-- explicit write policies. We still ENABLE RLS on content tables and grant
-- only SELECT to `authenticated`, which denies them writes by omission.
-- =====================================================================

-- =====================================================================
-- SECTION A — CONTENT TABLES: read by authenticated, write by service_role
-- =====================================================================

alter table public.lemmas            enable row level security;
alter table public.wordforms         enable row level security;
alter table public.phrases           enable row level security;
alter table public.phrase_components enable row level security;
alter table public.minimal_pairs     enable row level security;
alter table public.audio_assets      enable row level security;
alter table public.podcast_episodes  enable row level security;

-- SELECT-only policies for authenticated users. No INSERT/UPDATE/DELETE
-- policies are defined => those operations are denied for everyone except
-- service_role (which bypasses RLS). The content pipeline runs as service_role.

create policy "content_lemmas_read"
  on public.lemmas for select to authenticated using (true);

create policy "content_wordforms_read"
  on public.wordforms for select to authenticated using (true);

create policy "content_phrases_read"
  on public.phrases for select to authenticated using (true);

create policy "content_phrase_components_read"
  on public.phrase_components for select to authenticated using (true);

create policy "content_minimal_pairs_read"
  on public.minimal_pairs for select to authenticated using (true);

create policy "content_audio_assets_read"
  on public.audio_assets for select to authenticated using (true);

create policy "content_podcast_episodes_read"
  on public.podcast_episodes for select to authenticated using (true);

-- =====================================================================
-- SECTION B — USER STATE TABLES: auth.uid() = user_id
-- =====================================================================

-- ---- profiles (PK id == auth.users.id) -----------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No DELETE policy: account deletion runs via service_role / cascade from
-- auth.users so GDPR erasure is handled in one controlled path.

-- ---- review_state ---------------------------------------------------
alter table public.review_state enable row level security;

create policy "review_state_select_own"
  on public.review_state for select to authenticated
  using (auth.uid() = user_id);

create policy "review_state_insert_own"
  on public.review_state for insert to authenticated
  with check (auth.uid() = user_id);

create policy "review_state_update_own"
  on public.review_state for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "review_state_delete_own"
  on public.review_state for delete to authenticated
  using (auth.uid() = user_id);

-- ---- review_log (append-only from the client) ----------------------
alter table public.review_log enable row level security;

create policy "review_log_select_own"
  on public.review_log for select to authenticated
  using (auth.uid() = user_id);

create policy "review_log_insert_own"
  on public.review_log for insert to authenticated
  with check (auth.uid() = user_id);

-- Intentionally no UPDATE/DELETE policy: review_log is append-only.

-- ---- recordings (GDPR-sensitive; INSERT gated on consent) ----------
alter table public.recordings enable row level security;

create policy "recordings_select_own"
  on public.recordings for select to authenticated
  using (auth.uid() = user_id);

-- INSERT requires ownership AND an active recording consent on the profile.
-- consent_at is NOT NULL at the table level; this policy is the second gate.
create policy "recordings_insert_own_with_consent"
  on public.recordings for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.rec_consent = true
    )
  );

-- Users may delete their own recordings (GDPR erasure / honoring requests).
create policy "recordings_delete_own"
  on public.recordings for delete to authenticated
  using (auth.uid() = user_id);

-- No client UPDATE policy: score / score_payload are written by the external
-- ML service via service_role only.

-- =====================================================================
-- SECTION C — RECORDINGS STORAGE BUCKET (private; signed-URL access)
-- =====================================================================
-- Create the private bucket. Mirrors config.toml's local [storage.buckets]
-- so a hosted `db push` reproduces it. Idempotent.
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

-- Storage RLS mirrors the recordings table. Object paths are namespaced by
-- user id: the first path segment must equal auth.uid().
-- e.g. storage path 'recordings/<user_id>/<recording_id>.wav'.

create policy "recordings_storage_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recordings_storage_insert_own_with_consent"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.rec_consent = true
    )
  );

create policy "recordings_storage_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- END 0002_rls.sql
-- Retention: enforce a deletion/retention job for recordings out-of-band
-- (Edge Function / scheduled task). Project stance: sell the model, not the
-- data. Honor erasure requests by deleting both the row and the object.
-- =====================================================================
