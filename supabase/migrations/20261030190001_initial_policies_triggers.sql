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
     and new.is_gm = false
     and current_user not in ('postgres', 'service_role') then
    raise exception 'Game master status can only be claimed';
  end if;
  if new.is_gm = true
     and old.is_gm = false
     and exists (
       select 1
       from public.profiles other_profile
       where other_profile.game_code = new.game_code
         and other_profile.id <> new.id
         and other_profile.is_gm = true
     ) then
    raise exception 'This game already has a game master';
  end if;
  if new.is_decoy = true
     and old.is_decoy = false
     and (
       not exists (
         select 1
         from public.games game
         where game.game_code = new.game_code
           and game.has_decoy = true
       )
       or exists (
         select 1
         from public.profiles other_profile
         where other_profile.game_code = new.game_code
           and other_profile.id <> new.id
           and other_profile.is_decoy = true
       )
     ) then
    raise exception 'This game cannot have another decoy';
  end if;
  return new;
end;
$$;

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

drop trigger if exists profiles_updated_at on public.profiles;
drop trigger if exists profiles_role_fields on public.profiles;
drop trigger if exists chats_updated_at on public.chats;
drop trigger if exists private_chat_members_limit on public.chat_members;
drop trigger if exists votes_updated_at on public.votes;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger profiles_role_fields before update on public.profiles
for each row execute function public.protect_profile_role_fields();
create trigger chats_updated_at before update on public.chats
for each row execute function public.touch_updated_at();
create trigger private_chat_members_limit before insert on public.chat_members
for each row execute function public.enforce_private_chat_members_limit();
create trigger votes_updated_at before update on public.votes
for each row execute function public.touch_updated_at();

drop policy if exists "authenticated users read games" on public.games;
drop policy if exists "authenticated users create games" on public.games;
drop policy if exists "game masters update games" on public.games;
drop policy if exists "Game masters delete game messages" on public.messages;
drop policy if exists "profiles are public to authenticated users" on public.profiles;
drop policy if exists "users create own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "authenticated users read chats" on public.chats;
drop policy if exists "users create own chats" on public.chats;
drop policy if exists "hosts update chat state" on public.chats;
drop policy if exists "members read membership" on public.chat_members;
drop policy if exists "users join open chats" on public.chat_members;
drop policy if exists "users leave chats" on public.chat_members;
drop policy if exists "members read messages" on public.messages;
drop policy if exists "members send messages" on public.messages;
drop policy if exists "Players send open member messages" on public.messages;
drop policy if exists "Private chat creators add their recipient" on public.chat_members;
drop policy if exists "Game masters read game messages" on public.messages;
drop policy if exists "Players read open public game messages" on public.messages;
drop policy if exists "Players read public game messages" on public.messages;
drop policy if exists "Players send open public game messages" on public.messages;
drop policy if exists "Game masters send game messages" on public.messages;
drop policy if exists "Players send with gm messages" on public.messages;
drop policy if exists "Game masters update game chat state" on public.chats;
drop policy if exists "Players read own votes" on public.votes;
drop policy if exists "Game masters read game votes" on public.votes;
drop policy if exists "Players lock votes" on public.votes;
drop policy if exists "Players relock unlocked votes" on public.votes;
drop policy if exists "Game masters review votes" on public.votes;
drop policy if exists "Players read rounds in their game" on public.rounds;
drop policy if exists "Players read round scores in their game" on public.round_scores;
drop policy if exists "Users update their own chat read state" on public.chat_members;
drop policy if exists "Users upload their own profile images" on storage.objects;
drop policy if exists "Users replace their own profile images" on storage.objects;
drop policy if exists "Users delete their own profile images" on storage.objects;

create policy "authenticated users read games" on public.games
for select to authenticated using (true);
create policy "authenticated users create games" on public.games
for insert to authenticated
with check (true);
create policy "game masters update games" on public.games
for update to authenticated
using (
  exists (
    select 1
    from public.profiles gm
    where gm.id = (select auth.uid())
      and gm.is_gm = true
      and gm.game_code = games.game_code
  )
)
with check (
  exists (
    select 1
    from public.profiles gm
    where gm.id = (select auth.uid())
      and gm.is_gm = true
      and gm.game_code = games.game_code
  )
);
grant select, insert on public.games to authenticated;
create policy "Game masters delete game messages"
on public.messages
for delete
to authenticated
using (
  exists (
    select 1
    from public.chats c
    join public.profiles gm on gm.id = (select auth.uid())
    where c.id = messages.chat_id
      and c.chat_type = 'public'
      and gm.is_gm = true
      and gm.game_code = c.game_code
  )
);
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
create policy "Players send open member messages" on public.messages
for insert to authenticated with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.chat_members m
    join public.chats c on c.id = m.chat_id
    where m.chat_id = messages.chat_id
      and m.user_id = (select auth.uid())
      and c.status = 'open'
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chats'
  ) then
    alter publication supabase_realtime add table public.chats;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_members'
  ) then
    alter publication supabase_realtime add table public.chat_members;
  end if;
end;
$$;

create or replace function public.change_game_phase(
  p_game_code varchar(4),
  p_phase public.game_phase
) returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  game_row public.games;
  favorite_target_id uuid;
  active_round public.rounds;
  next_round_number integer;
begin
  select g.* into game_row
  from public.games g
  join public.profiles gm on gm.game_code = g.game_code
    and gm.id = (select auth.uid())
    and gm.is_gm = true
  where g.game_code = p_game_code
  for update;

  if game_row.game_code is null then
    raise exception 'Only the game master can change this game phase';
  end if;

  if game_row.phase = 'vote_phase' and p_phase in ('chat_phase', 'final') then
    select * into active_round
    from public.rounds
    where game_code = p_game_code
      and status = 'active'
    for update;

    if active_round.id is null then
      raise exception 'No active round is available to finalize';
    end if;
    insert into public.round_scores (round_id, user_id, points)
    select
      active_round.id,
      player.id,
      coalesce(sum(
        case v.status
          when 'correct' then game_row.correct_score
          when 'exists' then game_row.exist_score
          else 0
        end
      ), 0)::integer
    from public.profiles player
    left join public.votes v
      on v.voter_id = player.id
     and v.round_id = active_round.id
     and v.vote_kind = 'guess'
    where player.game_code = p_game_code
      and player.is_gm = false
    group by player.id
    on conflict (round_id, user_id) do update
      set points = excluded.points;

    select favorite.target_id into favorite_target_id
    from public.votes favorite
    where favorite.round_id = active_round.id
      and favorite.vote_kind = 'decoy_favorite'
      and favorite.status <> 'unlocked'
    order by favorite.updated_at desc
    limit 1;

    update public.round_scores
    set points = points + game_row.decoy_score
    where round_id = active_round.id
      and user_id = favorite_target_id;

    update public.profiles p
    set current_score = scores.points,
        score = p.score + scores.points
    from public.round_scores scores
    where scores.round_id = active_round.id
      and p.id = scores.user_id;

    update public.rounds
    set status = 'finalized',
        finalized_at = now()
    where id = active_round.id;

    select coalesce(max(round_number), 0) + 1
      into next_round_number
    from public.rounds
    where game_code = p_game_code;

    insert into public.rounds (game_code, round_number)
    values (p_game_code, next_round_number)
    returning * into active_round;

    update public.games
    set decoy_favorite_id = favorite_target_id
    where game_code = p_game_code;

    insert into public.chats (game_code, name, description, created_by, chat_type)
    select
      p_game_code,
      format('%s & GM', left(coalesce(player.display_name, 'Unnamed player'), 54)),
      'A private conversation with the game master.',
      player.id,
      'with_gm'
    from public.profiles player
    where player.game_code = p_game_code
      and player.is_gm = false
      and not exists (
        select 1
        from public.chats existing_chat
        where existing_chat.game_code = p_game_code
          and existing_chat.chat_type = 'with_gm'
          and existing_chat.created_by = player.id
      );

    insert into public.chat_members (chat_id, user_id)
    select c.id, member.id
    from public.chats c
    join public.profiles member
      on member.game_code = p_game_code
     and (member.id = c.created_by or member.is_gm = true)
    where c.game_code = p_game_code
      and c.chat_type = 'with_gm'
    on conflict (chat_id, user_id) do nothing;
  elsif p_phase = 'chat_phase'
        and not exists (
          select 1 from public.rounds
          where game_code = p_game_code and status = 'active'
        ) then
    insert into public.rounds (game_code, round_number)
    select p_game_code, coalesce(max(round_number), 0) + 1
    from public.rounds
    where game_code = p_game_code
    returning * into active_round;
  end if;

  if p_phase = 'vote_phase' then
    select * into active_round
    from public.rounds
    where game_code = p_game_code
      and status = 'active'
    for update;
    if active_round.id is null then
      raise exception 'No active round is available for voting';
    end if;
    delete from public.votes where round_id = active_round.id;
    delete from public.round_scores where round_id = active_round.id;
    update public.games
    set decoy_favorite_id = null
    where game_code = p_game_code;
    update public.profiles
    set current_score = 0
    where game_code = p_game_code
      and is_gm = false;
  end if;

  update public.games
  set phase = p_phase
  where game_code = p_game_code
  returning * into game_row;

  return game_row;
end;
$$;

create or replace function public.send_round_results(
  p_game_code varchar(4)
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_game_code varchar(4);
  current_phase public.game_phase;
  finalized_round public.rounds;
  gm_id uuid;
begin
  select game_code into requester_game_code
  from public.profiles
  where id = (select auth.uid());

  if requester_game_code is null or requester_game_code <> p_game_code then
    raise exception 'You cannot send results for this game';
  end if;

  select phase into current_phase
  from public.games
  where game_code = p_game_code;

  if current_phase not in ('chat_phase', 'final') then
    return false;
  end if;

  select * into finalized_round
  from public.rounds
  where game_code = p_game_code
    and status = 'finalized'
    and results_sent_at is null
    and round_number = (
      select max(round_number)
      from public.rounds
      where game_code = p_game_code
        and status = 'finalized'
    )
  order by round_number desc
  limit 1
  for update;

  if finalized_round.id is null then
    return false;
  end if;

  select id into gm_id
  from public.profiles
  where game_code = p_game_code
    and is_gm = true
  limit 1;

  insert into public.messages (chat_id, sender_id, content)
  select
    c.id,
    gm_id,
    format(
      E'⚠️ Here Are This Round"s Results:\n\nYou guessed %s person%s exactly correctly.\nYou guessed %s person%s that ARE in the game but for the wrong character.',
      count(*) filter (where v.vote_kind = 'guess' and v.status = 'correct'),
      case when count(*) filter (where v.vote_kind = 'guess' and v.status = 'correct') = 1 then '' else 's' end,
      count(*) filter (where v.vote_kind = 'guess' and v.status = 'exists'),
      case when count(*) filter (where v.vote_kind = 'guess' and v.status = 'exists') = 1 then '' else 's' end
    )
  from public.chats c
  join public.profiles player on player.id = c.created_by
  left join public.votes v
    on v.voter_id = player.id
   and v.round_id = finalized_round.id
  where c.game_code = p_game_code
    and c.chat_type = 'with_gm'
    and player.is_gm = false
    and player.is_decoy = false
  group by c.id;

  update public.rounds
  set results_sent_at = now()
  where id = finalized_round.id;

  return true;
end;
$$;

revoke execute on function public.change_game_phase(varchar(4), public.game_phase) from public;
grant execute on function public.change_game_phase(varchar(4), public.game_phase) to authenticated;
revoke execute on function public.send_round_results(varchar(4)) from public;
grant execute on function public.send_round_results(varchar(4)) to authenticated;

create policy "Players read rounds in their game"
on public.rounds
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.game_code = rounds.game_code
  )
);

create policy "Players read round scores in their game"
on public.round_scores
for select
to authenticated
using (
  exists (
    select 1
    from public.rounds round
    join public.profiles profile on profile.game_code = round.game_code
    where round.id = round_scores.round_id
      and profile.id = (select auth.uid())
  )
);

create policy "Users update their own chat read state"
on public.chat_members
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.mark_chat_read(p_chat_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.chat_members
  set last_read_at = now()
  where chat_id = p_chat_id
    and user_id = (select auth.uid());
$$;

create or replace function public.get_unread_chat_counts(p_chat_ids uuid[])
returns table(chat_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    membership.chat_id,
    count(message.id)::bigint
  from public.chat_members membership
  left join public.messages message
    on message.chat_id = membership.chat_id
   and message.sender_id <> (select auth.uid())
   and (
     membership.last_read_at is null
     or message.created_at > membership.last_read_at
   )
  where membership.user_id = (select auth.uid())
    and membership.chat_id = any(p_chat_ids)
  group by membership.chat_id;
$$;

revoke execute on function public.mark_chat_read(uuid) from public;
grant execute on function public.mark_chat_read(uuid) to authenticated;
revoke execute on function public.get_unread_chat_counts(uuid[]) from public;
grant execute on function public.get_unread_chat_counts(uuid[]) to authenticated;

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

create or replace function public.create_game_with_public_chat(
  p_game_code varchar(4),
  p_has_decoy boolean,
  p_correct_score integer,
  p_exist_score integer,
  p_allow_private_chats boolean,
  p_decoy_score integer
) returns public.games
language plpgsql
security invoker
set search_path = public
as $$
declare
  game_row public.games;
begin
  insert into public.games (
    game_code,
    has_decoy,
    correct_score,
    exist_score,
    allow_private_chats,
    decoy_score
  )
  values (
    upper(p_game_code),
    p_has_decoy,
    p_correct_score,
    p_exist_score,
    p_allow_private_chats,
    p_decoy_score
  )
  returning * into game_row;

  insert into public.chats (
    game_code,
    name,
    description,
    created_by,
    chat_type
  )
  values (
    game_row.game_code,
    'Public Chat',
    format('The shared chat for game %s.', game_row.game_code),
    (select auth.uid()),
    'public'
  );

  return game_row;
end;
$$;

revoke execute on function public.create_game_with_public_chat(varchar(4), boolean, integer, integer, boolean, integer) from public;
grant execute on function public.create_game_with_public_chat(varchar(4), boolean, integer, integer, boolean, integer) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rounds'
  ) then
    alter publication supabase_realtime add table public.rounds;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'round_scores'
  ) then
    alter publication supabase_realtime add table public.round_scores;
  end if;
end;
$$;

create policy "Users upload their own profile images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users replace their own profile images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users delete their own profile images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Private chat creators add their recipient" on public.chat_members;

create policy "Private chat creators add their recipient"
on public.chat_members
for insert
to authenticated
with check (
  user_id <> (select auth.uid())
  and exists (
    select 1
    from public.chats c
    join public.profiles creator on creator.id = c.created_by
    join public.profiles recipient on recipient.id = chat_members.user_id
    where c.id = chat_id
      and c.chat_type in ('private', 'with_gm')
      and c.created_by = (select auth.uid())
      and c.status = 'open'
      and creator.game_code = recipient.game_code
      and (
        (c.chat_type = 'private' and recipient.is_gm = false)
        or (c.chat_type = 'with_gm' and recipient.is_gm = true)
      )
  )
);


create policy "Game masters read game messages"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.chats c
    join public.profiles gm on gm.id = (select auth.uid())
    where c.id = messages.chat_id
      and gm.is_gm = true
      and gm.game_code = c.game_code
  )
);

create policy "Players read public game messages"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.chats c
    join public.profiles player on player.id = (select auth.uid())
    where c.id = messages.chat_id
      and c.chat_type = 'public'
      and player.game_code = c.game_code
      and player.is_gm = false
  )
);

create policy "Players send open public game messages"
on public.messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.chats c
    join public.profiles player on player.id = (select auth.uid())
    where c.id = messages.chat_id
      and c.chat_type = 'public'
      and c.status = 'open'
      and player.game_code = c.game_code
      and player.is_gm = false
  )
);

create policy "Game masters send game messages"
on public.messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.chats c
    join public.profiles gm on gm.id = (select auth.uid())
    where     c.id = messages.chat_id
    and gm.is_gm = true
      and gm.game_code = c.game_code
  )
);

create policy "Players send with gm messages"
on public.messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.chat_members m
    join public.chats c on c.id = m.chat_id
    join public.profiles player on player.id = (select auth.uid())
    where m.chat_id = messages.chat_id
      and m.user_id = (select auth.uid())
      and c.chat_type = 'with_gm'
      and c.status = 'open'
      and player.is_gm = false
      and player.game_code = c.game_code
  )
);

create policy "Game masters update game chat state"
on public.chats
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles gm
    where gm.id = (select auth.uid())
      and gm.is_gm = true
      and gm.game_code = chats.game_code
  )
)
with check (
  exists (
    select 1
    from public.profiles gm
    where gm.id = (select auth.uid())
      and gm.is_gm = true
      and gm.game_code = chats.game_code
  )
);

create policy "Players read own votes" on public.votes
for select to authenticated using (voter_id = (select auth.uid()));

create policy "Game masters read game votes" on public.votes
for select to authenticated using (
  exists (
    select 1 from public.profiles gm
    where gm.id = (select auth.uid())
      and gm.is_gm = true
      and gm.game_code = votes.game_code
  )
);

create policy "Players lock votes" on public.votes
for insert to authenticated
with check (
  voter_id = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1
    from public.games g
    join public.rounds r on r.game_code = g.game_code
    join public.profiles voter on voter.id = (select auth.uid())
    join public.profiles target on target.id = votes.target_id
    where g.game_code = votes.game_code
      and g.phase = 'vote_phase'
      and r.id = votes.round_id
      and r.status = 'active'
      and voter.game_code = g.game_code
      and (
        (votes.vote_kind = 'guess' and voter.is_gm = false)
        or (votes.vote_kind = 'decoy_favorite' and voter.is_decoy = true)
      )
      and target.game_code = g.game_code
      and target.is_gm = false
      and target.id <> voter.id
  )
);

create policy "Players relock unlocked votes" on public.votes
for update to authenticated
using (
  voter_id = (select auth.uid())
  and status = 'unlocked'
  and exists (
    select 1 from public.rounds r
    where r.id = votes.round_id and r.status = 'active'
  )
)
with check (
  voter_id = (select auth.uid())
  and status = 'pending'
);

create policy "Game masters review votes" on public.votes
for update to authenticated
using (
  exists (
    select 1 from public.profiles gm
    where gm.id = (select auth.uid())
      and gm.is_gm = true
      and gm.game_code = votes.game_code
  )
)
with check (
  status in ('unlocked', 'correct', 'exists', 'none')
  and exists (
    select 1 from public.profiles gm
    where gm.id = (select auth.uid())
      and gm.is_gm = true
      and gm.game_code = votes.game_code
  )
);

create or replace function public.get_final_guess_counts(
  p_game_code varchar(4)
) returns table(target_id uuid, correct_guess_count bigint)
language sql
security definer
set search_path = public
as $$
  select v.target_id, count(*)::bigint
  from public.votes v
  join public.games g on g.game_code = v.game_code
  join public.profiles viewer
    on viewer.id = (select auth.uid())
   and viewer.game_code = v.game_code
  where v.game_code = p_game_code
    and g.phase = 'final'
    and v.vote_kind = 'guess'
    and v.status = 'correct'
  group by v.target_id;
$$;

revoke execute on function public.get_final_guess_counts(varchar(4)) from public;
grant execute on function public.get_final_guess_counts(varchar(4)) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'votes'
  ) then
    alter publication supabase_realtime add table public.votes;
  end if;
end;
$$;
