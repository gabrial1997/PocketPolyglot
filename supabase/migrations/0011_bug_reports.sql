-- 0011: in-app bug reports (beta tooling). Table + private screenshot bucket, RLS-scoped to owner.
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  description text not null,
  screen text,
  app_version text,
  platform text,
  os_version text,
  screenshot_path text,
  extra jsonb not null default '{}'::jsonb,
  status text not null default 'open'
);

alter table public.bug_reports enable row level security;

create policy "bug_reports own insert" on public.bug_reports
  for insert to authenticated with check (auth.uid() = user_id);
create policy "bug_reports own select" on public.bug_reports
  for select to authenticated using (auth.uid() = user_id);

-- Private screenshot bucket (no public read).
insert into storage.buckets (id, name, public)
  values ('bug-screenshots', 'bug-screenshots', false)
  on conflict (id) do nothing;

create policy "bug screenshots own folder upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bug-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bug screenshots own folder read" on storage.objects
  for select to authenticated
  using (bucket_id = 'bug-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
