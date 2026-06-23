-- Migration: 0010_profile_autocreate.sql
-- WHAT: Trigger + function that auto-creates a public.profiles row whenever a new
--       auth.users row is inserted.
-- WHY:  Guarantees profiles.created_at is populated at signup, making it the reliable
--       account-age source for Module B's pacing logic (day 0 / day 1 / day N gates).
--       Without this, a profile row only exists if the client explicitly calls the
--       upsert — any crash/network drop between signup and that call leaves the user
--       with no profile, breaking pacing.
-- IDEMPOTENCY: create or replace function, drop trigger if exists, on conflict do nothing.
-- SECURITY: security definer is required so the trigger (which fires in the auth schema
--           context) has permission to write to public.profiles. search_path is pinned to
--           public to prevent search-path injection (mitigates Supabase security advisor
--           warning about security-definer functions).

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Revoke direct EXECUTE from public roles: handle_new_user() is a trigger-only
-- function and must never be callable via the REST API (/rpc/handle_new_user).
-- This silences the Supabase security advisor WARNs:
--   anon_security_definer_function_executable
--   authenticated_security_definer_function_executable
revoke execute on function public.handle_new_user() from anon, authenticated;
