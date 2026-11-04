create extension if not exists "pgcrypto";

-- This file is intentionally destructive: it rebuilds the schema from scratch.
drop table if exists public.messages cascade;
drop table if exists public.room_members cascade;
drop table if exists public.chat_members cascade;
drop table if exists public.rooms cascade;
drop table if exists public.chats cascade;
drop table if exists public.profiles cascade;
drop table if exists public.games cascade;
drop type if exists public.room_status cascade;
drop type if exists public.chat_type cascade;
drop type if exists public.chat_status cascade;
drop type if exists public.game_phase cascade;

create type public.chat_type as enum ('public', 'private');
create type public.chat_status as enum ('open', 'locked');
create type public.game_phase as enum ('not_started', 'chat_phase', 'vote_phase');

create table public.games (
  game_code varchar(4) primary key check (game_code ~ '^[A-Za-z0-9]{4}$'),
  phase public.game_phase not null default 'not_started',
  has_decoy boolean not null default false
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  real_name text,
  display_name text,
  profile_image_url text,
  job text,
  age integer,
  bio text,
  is_gm boolean not null default false,
  is_decoy boolean not null default false,
  score integer not null default 0,
  game_code varchar(4) references public.games(game_code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint display_name_length check (display_name is null or char_length(display_name) between 1 and 50),
  constraint profile_image_url_length check (profile_image_url is null or char_length(profile_image_url) <= 2048),
  constraint bio_length check (bio is null or char_length(bio) <= 280)
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  game_code varchar(4) not null references public.games(game_code),
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

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;