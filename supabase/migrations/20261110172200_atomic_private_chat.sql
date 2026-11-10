alter table public.chats
  add column private_participant_one_id uuid references public.profiles(id) on delete cascade,
  add column private_participant_two_id uuid references public.profiles(id) on delete cascade;

with private_pairs as (
  select
    cm.chat_id,
    (array_agg(cm.user_id order by cm.user_id))[1] as participant_one_id,
    (array_agg(cm.user_id order by cm.user_id))[2] as participant_two_id
  from public.chat_members cm
  join public.chats c on c.id = cm.chat_id
  where c.chat_type = 'private'
  group by cm.chat_id
  having count(*) = 2
)
update public.chats c
set private_participant_one_id = private_pairs.participant_one_id,
    private_participant_two_id = private_pairs.participant_two_id
from private_pairs
where c.id = private_pairs.chat_id;

do $$
begin
  if exists (
    select 1
    from public.chats
    where chat_type = 'private'
      and (
        private_participant_one_id is null
        or private_participant_two_id is null
      )
  ) then
    raise exception 'Cannot enforce private chat participants: an existing private chat does not have exactly two members';
  end if;
end;
$$;

alter table public.chats
  add constraint private_chat_participants_check check (
    (chat_type = 'private'
      and private_participant_one_id is not null
      and private_participant_two_id is not null
      and private_participant_one_id < private_participant_two_id)
    or (chat_type <> 'private'
      and private_participant_one_id is null
      and private_participant_two_id is null)
  );

create unique index chats_private_participants_unique_idx
  on public.chats (
    game_code,
    private_participant_one_id,
    private_participant_two_id
  )
  where chat_type = 'private';

create or replace function public.enforce_private_chat_members_limit() returns trigger
language plpgsql
as $$
begin
  if (select chat_type from public.chats where id = new.chat_id) = 'private' then
    perform 1
    from public.chats
    where id = new.chat_id
    for update;

    if (select count(*) from public.chat_members where chat_id = new.chat_id) >= 2 then
      raise exception 'Private chats can only have two members';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.get_or_create_private_chat(
  p_game_code varchar(4),
  p_recipient_id uuid
) returns public.chats
language plpgsql
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_profile public.profiles;
  recipient_profile public.profiles;
  game_row public.games;
  chat_row public.chats;
  participant_one_id uuid;
  participant_two_id uuid;
begin
  if current_user_id is null or p_recipient_id = current_user_id then
    raise exception 'Invalid private chat participants';
  end if;

  select * into current_profile
  from public.profiles
  where id = current_user_id;

  select * into recipient_profile
  from public.profiles
  where id = p_recipient_id;

  if current_profile.id is null
     or recipient_profile.id is null
     or current_profile.game_code <> upper(p_game_code)
     or recipient_profile.game_code <> upper(p_game_code)
     or recipient_profile.is_gm then
    raise exception 'Private chats are limited to players in your game.';
  end if;

  select * into game_row
  from public.games
  where game_code = upper(p_game_code);

  if game_row.game_code is null then
    raise exception 'Private chat game was not found.';
  end if;
  if not game_row.allow_private_chats then
    raise exception 'Private chats are currently disabled by the game master.';
  end if;

  participant_one_id := least(current_user_id, p_recipient_id);
  participant_two_id := greatest(current_user_id, p_recipient_id);

  insert into public.chats (
    game_code,
    name,
    description,
    created_by,
    chat_type,
    private_participant_one_id,
    private_participant_two_id
  )
  values (
    upper(p_game_code),
    format(
      '%s & %s',
      left(coalesce(current_profile.display_name, 'Unnamed player'), 28),
      left(coalesce(recipient_profile.display_name, 'Unnamed player'), 28)
    ),
    'A private player conversation.',
    current_user_id,
    'private',
    participant_one_id,
    participant_two_id
  )
  on conflict (
    game_code,
    private_participant_one_id,
    private_participant_two_id
  ) where chat_type = 'private' do nothing
  returning * into chat_row;

  if chat_row.id is null then
    select * into chat_row
    from public.chats
    where game_code = upper(p_game_code)
      and chat_type = 'private'
      and private_participant_one_id = participant_one_id
      and private_participant_two_id = participant_two_id
    for update;
  end if;

  insert into public.chat_members (chat_id, user_id)
  values
    (chat_row.id, current_user_id),
    (chat_row.id, p_recipient_id)
  on conflict (chat_id, user_id) do nothing;

  return chat_row;
end;
$$;

revoke execute on function public.get_or_create_private_chat(varchar(4), uuid) from public;
grant execute on function public.get_or_create_private_chat(varchar(4), uuid) to authenticated;
