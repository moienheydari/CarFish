create extension if not exists "pgcrypto";

create type public.room_status as enum ('waiting', 'active', 'finished');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  username_normalized text generated always as (lower(username)) stored unique,
  display_name text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username is null or username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint display_name_length check (display_name is null or char_length(display_name) <= 50),
  constraint bio_length check (bio is null or char_length(bio) <= 280)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 60),
  description text check (description is null or char_length(description) <= 280),
  created_by uuid not null references public.profiles(id) on delete restrict,
  status public.room_status not null default 'waiting',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  content text not null check (char_length(trim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index rooms_created_at_idx on public.rooms(created_at desc);
create index room_members_user_id_idx on public.room_members(user_id);
create index messages_room_created_at_idx on public.messages(room_id, created_at desc);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger rooms_updated_at before update on public.rooms for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;

create policy "profiles are public to authenticated users" on public.profiles for select to authenticated using (true);
create policy "users create own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "authenticated users read rooms" on public.rooms for select to authenticated using (true);
create policy "users create own rooms" on public.rooms for insert to authenticated with check (created_by = auth.uid());
create policy "hosts update room state" on public.rooms for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "members read membership" on public.room_members for select to authenticated using (true);
create policy "users join rooms" on public.room_members for insert to authenticated with check (user_id = auth.uid());
create policy "users leave rooms" on public.room_members for delete to authenticated using (user_id = auth.uid() and not exists (select 1 from public.rooms where rooms.id = room_id and rooms.created_by = auth.uid()));
create policy "members read messages" on public.messages for select to authenticated using (exists (select 1 from public.room_members m where m.room_id = messages.room_id and m.user_id = auth.uid()));
create policy "members send messages" on public.messages for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.room_members m where m.room_id = messages.room_id and m.user_id = auth.uid()));

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.rooms;
