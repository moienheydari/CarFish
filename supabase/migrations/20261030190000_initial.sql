create extension if not exists "pgcrypto";

-- This file is intentionally destructive: it rebuilds the schema from scratch.
drop table if exists public.messages cascade;
drop table if exists public.room_members cascade;
drop table if exists public.chat_members cascade;
drop table if exists public.rooms cascade;
drop table if exists public.chats cascade;
drop table if exists public.profiles cascade;
drop type if exists public.room_status cascade;
drop type if exists public.chat_type cascade;
drop type if exists public.chat_status cascade;

create type public.chat_type as enum ('public', 'private');
create type public.chat_status as enum ('open', 'locked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  profile_image_url text,
  bio text,
  is_gm boolean not null default false,
  game_code varchar(4) not null check (game_code ~ '^[A-Za-z0-9]{4}$') default 'FREE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint display_name_length check (display_name is null or char_length(display_name) between 1 and 50),
  constraint profile_image_url_length check (profile_image_url is null or char_length(profile_image_url) <= 2048),
  constraint bio_length check (bio is null or char_length(bio) <= 280)
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  game_code varchar(4) not null check (game_code ~ '^[A-Za-z0-9]{4}$'),
  name text not null check (char_length(name) between 3 and 60),
  description text check (description is null or char_length(description) <= 280),
  created_by uuid not null references public.profiles(id) on delete restrict,
  chat_type public.chat_type not null default 'public',
  status public.chat_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  content text not null check (char_length(trim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index chats_game_code_created_at_idx on public.chats(game_code, created_at desc);
create index chats_created_at_idx on public.chats(created_at desc);
create index chat_members_user_id_idx on public.chat_members(user_id);
create index messages_chat_created_at_idx on public.messages(chat_id, created_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_profile_role_fields() returns trigger
language plpgsql
as $$
begin
  if new.is_gm is distinct from old.is_gm
     and current_user not in ('postgres', 'service_role') then
    raise exception 'Only a trusted server can change is_gm';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_private_chat_members_limit() returns trigger
language plpgsql
as $$
begin
  if (select chat_type from public.chats where id = new.chat_id) = 'private'
     and (select count(*) from public.chat_members where chat_id = new.chat_id) >= 2 then
    raise exception 'Private chats can only have two members';
  end if;
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger profiles_role_fields before update on public.profiles
for each row execute function public.protect_profile_role_fields();
create trigger chats_updated_at before update on public.chats
for each row execute function public.touch_updated_at();
create trigger private_chat_members_limit before insert on public.chat_members
for each row execute function public.enforce_private_chat_members_limit();

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;

create policy "profiles are public to authenticated users" on public.profiles
for select to authenticated using (true);
create policy "users create own profile" on public.profiles
for insert to authenticated with check (id = auth.uid());
create policy "users update own profile" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "authenticated users read chats" on public.chats
for select to authenticated using (true);
create policy "users create own chats" on public.chats
for insert to authenticated with check (created_by = auth.uid());
create policy "hosts update chat state" on public.chats
for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "members read membership" on public.chat_members
for select to authenticated using (true);
create policy "users join open chats" on public.chat_members
for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.chats where chats.id = chat_id and chats.status = 'open')
);
create policy "users leave chats" on public.chat_members
for delete to authenticated using (
  user_id = auth.uid()
  and not exists (select 1 from public.chats where chats.id = chat_id and chats.created_by = auth.uid())
);
create policy "members read messages" on public.messages
for select to authenticated using (
  exists (select 1 from public.chat_members m where m.chat_id = messages.chat_id and m.user_id = auth.uid())
);
create policy "members send messages" on public.messages
for insert to authenticated with check (
  sender_id = auth.uid()
  and exists (select 1 from public.chat_members m where m.chat_id = messages.chat_id and m.user_id = auth.uid())
);

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.chats;
