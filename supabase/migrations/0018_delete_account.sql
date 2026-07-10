-- supabase/migrations/0018_delete_account.sql
-- 0018: Apple-mandated in-app account deletion (spec 2026-07-09 §2a). One SECURITY DEFINER RPC,
-- self-targeting ONLY (auth.uid()), no parameters — a caller can never delete anyone else.
-- Every user-owned public table (profiles 0001:202, recordings 0001:218, review_state 0001:243,
-- review_log 0001:269, bug_reports 0011:4) references auth.users ON DELETE CASCADE, so deleting
-- the auth user removes all rows. The client removes recording OBJECTS via the storage API first
-- (SupabaseProfileService.deleteRecordings); the storage.objects delete below is belt-and-braces
-- for anything that slipped past it (bucket layout: `${userId}/...`).
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'delete_account: not authenticated';
  end if;
  delete from storage.objects
    where bucket_id = 'recordings' and name like auth.uid()::text || '/%';
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
