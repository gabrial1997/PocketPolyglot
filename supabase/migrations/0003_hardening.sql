-- =====================================================================
-- PocketPolyglot — 0003_hardening.sql
-- Addresses the Supabase advisors raised after 0001/0002:
--   * SECURITY (function_search_path_mutable): pin get_distractors search_path.
--   * PERF (auth_rls_initplan): wrap auth.uid() in (select auth.uid()) so RLS
--     evaluates it ONCE per query instead of once per row. Recreate the
--     user-state + storage policies with the optimized form.
--   * PERF (unindexed_foreign_keys): covering indexes for the two FKs.
-- =====================================================================

-- ---- 1) get_distractors: pin search_path (body is fully schema-qualified) ----
create or replace function public.get_distractors(target uuid, n int default 3)
returns setof public.lemmas
language sql
stable
set search_path = ''
as $$
  select *
  from public.lemmas
  where id <> target
    and word_class = (select word_class from public.lemmas where id = target)
    and freq_band between
        (select freq_band from public.lemmas where id = target) - 1 and
        (select freq_band from public.lemmas where id = target) + 1
    and qa_status <> 'draft'
  order by random()
  limit n;
$$;

-- ---- 2) Recreate user-state RLS policies with (select auth.uid()) ----
-- profiles
drop policy "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
drop policy "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
drop policy "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- review_state
drop policy "review_state_select_own" on public.review_state;
create policy "review_state_select_own" on public.review_state for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy "review_state_insert_own" on public.review_state;
create policy "review_state_insert_own" on public.review_state for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy "review_state_update_own" on public.review_state;
create policy "review_state_update_own" on public.review_state for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy "review_state_delete_own" on public.review_state;
create policy "review_state_delete_own" on public.review_state for delete to authenticated
  using ((select auth.uid()) = user_id);

-- review_log (append-only)
drop policy "review_log_select_own" on public.review_log;
create policy "review_log_select_own" on public.review_log for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy "review_log_insert_own" on public.review_log;
create policy "review_log_insert_own" on public.review_log for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- recordings (GDPR: insert gated on consent)
drop policy "recordings_select_own" on public.recordings;
create policy "recordings_select_own" on public.recordings for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy "recordings_insert_own_with_consent" on public.recordings;
create policy "recordings_insert_own_with_consent" on public.recordings for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.rec_consent = true)
  );
drop policy "recordings_delete_own" on public.recordings;
create policy "recordings_delete_own" on public.recordings for delete to authenticated
  using ((select auth.uid()) = user_id);

-- recordings Storage bucket policies (same optimization)
drop policy "recordings_storage_select_own" on storage.objects;
create policy "recordings_storage_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy "recordings_storage_insert_own_with_consent" on storage.objects;
create policy "recordings_storage_insert_own_with_consent" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.rec_consent = true)
  );
drop policy "recordings_storage_delete_own" on storage.objects;
create policy "recordings_storage_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---- 3) Covering indexes for the two foreign keys ----
create index if not exists recordings_user_id_idx on public.recordings (user_id);
create index if not exists review_log_recording_id_idx on public.review_log (recording_id);
