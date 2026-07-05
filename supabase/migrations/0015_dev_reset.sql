-- 0015_dev_reset.sql — self-service progress reset (dev/testing; also GDPR-friendly).
-- review_log is append-only for normal client operations (0002 grants no DELETE).
-- This SECURITY DEFINER function is the single sanctioned escape hatch: it deletes
-- ONLY the calling user's own rows, so it grants no cross-user power.

create or replace function public.reset_my_progress()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.review_log where user_id = auth.uid();
  delete from public.review_state where user_id = auth.uid();
$$;

revoke all on function public.reset_my_progress() from public;
grant execute on function public.reset_my_progress() to authenticated;
