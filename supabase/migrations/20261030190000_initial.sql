create extension if not exists "pgcrypto";

-- This file is intentionally destructive: it rebuilds the schema from scratch.
drop table if exists public.messages cascade;
drop table if exists public.round_scores cascade;
drop table if exists public.rounds cascade;
drop table if exists public.votes cascade;
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
drop type if exists public.vote_status cascade;
drop type if exists public.vote_kind cascade;
drop type if exists public.round_status cascade;

create type public.chat_type as enum ('public', 'private', 'with_gm');
create type public.chat_status as enum ('open', 'locked');
create type public.game_phase as enum ('not_started', 'chat_phase', 'vote_phase', 'final');
create type public.vote_status as enum ('unlocked', 'pending', 'correct', 'exists', 'none');
create type public.vote_kind as enum ('guess', 'decoy_favorite');
create type public.round_status as enum ('active', 'finalized');

create table public.games (
  game_code varchar(4) primary key check (game_code ~ '^[A-Za-z0-9]{4}$'),
  phase public.game_phase not null default 'not_started',
  has_decoy boolean not null default false,
  correct_score integer not null default 3 check (correct_score >= 0),
  exist_score integer not null default 1 check (exist_score >= 0),
  allow_private_chats boolean not null default false
  ,decoy_score integer not null default 0 check (decoy_score >= 0)
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
  current_score integer not null default 0,
  game_code varchar(4) references public.games(game_code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint display_name_length check (display_name is null or char_length(display_name) between 1 and 50),
  constraint profile_image_url_length check (profile_image_url is null or char_length(profile_image_url) <= 2048),
  constraint bio_length check (bio is null or char_length(bio) <= 280)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  game_code varchar(4) not null references public.games(game_code) on delete cascade,
  round_number integer not null check (round_number > 0),
  status public.round_status not null default 'active',
  finalized_at timestamptz,
  unique (game_code, round_number),
  check (
    (status = 'active' and finalized_at is null)
    or (status = 'finalized' and finalized_at is not null)
  )
);

create unique index rounds_one_active_per_game_idx
  on public.rounds (game_code)
  where status = 'active';

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  game_code varchar(4) not null references public.games(game_code) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  guess text not null check (char_length(trim(guess)) between 1 and 100),
  status public.vote_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  vote_kind public.vote_kind not null default 'guess',
  round_id uuid not null references public.rounds(id) on delete cascade,
  check (voter_id <> target_id)
);

create table public.round_scores (
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null check (points >= 0),
  primary key (round_id, user_id)
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  game_code varchar(4) not null references public.games(game_code),
  name text not null check (char_length(name) between 3 and 60),
  description text check (description is null or char_length(description) <= 280),
  created_by uuid not null references public.profiles(id) on delete restrict,
  chat_type public.chat_type not null default 'public',
  status public.chat_status not null default 'open',
  private_participant_one_id uuid references public.profiles(id) on delete cascade,
  private_participant_two_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_chat_participants_check check (
    (chat_type = 'private'
      and private_participant_one_id is not null
      and private_participant_two_id is not null
      and private_participant_one_id < private_participant_two_id)
    or (chat_type <> 'private'
      and private_participant_one_id is null
      and private_participant_two_id is null)
  )
);

create table public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
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
create index votes_game_voter_idx on public.votes(game_code, voter_id);
create index votes_game_status_idx on public.votes(game_code, status);
create index rounds_game_code_idx on public.rounds(game_code, round_number desc);
create index round_scores_user_id_idx on public.round_scores(user_id);
create index votes_round_id_idx on public.votes(round_id);
create index chat_members_user_read_idx on public.chat_members(user_id, chat_id, last_read_at);
create unique index chats_private_participants_unique_idx
  on public.chats (
    game_code,
    private_participant_one_id,
    private_participant_two_id
  )
  where chat_type = 'private';

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
alter table public.votes enable row level security;
alter table public.rounds enable row level security;
alter table public.round_scores enable row level security;
alter table public.games add column decoy_favorite_id uuid references public.profiles(id) on delete set null;