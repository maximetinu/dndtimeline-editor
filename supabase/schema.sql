-- supabase/schema.sql  (applied via Supabase Management API query endpoint)
create extension if not exists "pgcrypto";

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default '',
  start_minutes bigint not null,
  color         text not null default '#0079CC',
  image_path    text,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.events enable row level security;

drop policy if exists events_read_public on public.events;
create policy events_read_public on public.events
  for select to anon, authenticated using (true);

drop policy if exists events_write_auth on public.events;
create policy events_write_auth on public.events
  for all to authenticated using (true) with check (true);

-- storage bucket for images (public read)
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

drop policy if exists images_read_public on storage.objects;
create policy images_read_public on storage.objects
  for select to anon, authenticated using (bucket_id = 'event-images');

drop policy if exists images_write_auth on storage.objects;
create policy images_write_auth on storage.objects
  for all to authenticated using (bucket_id = 'event-images') with check (bucket_id = 'event-images');
