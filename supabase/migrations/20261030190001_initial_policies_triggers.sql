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
  if (select chat_type from public.chats where id = new.chat_id) = 'private'
     and (select count(*) from public.chat_members where chat_id = new.chat_id) >= 2 then
    raise exception 'Private chats can only have two members';
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
drop policy if exists "Users upload their own profile images" on storage.objects;
drop policy if exists "Users replace their own profile images" on storage.objects;
drop policy if exists "Users delete their own profile images" on storage.objects;
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
    join public.profiles voter on voter.id = (select auth.uid())
    join public.profiles target on target.id = votes.target_id
    where g.game_code = votes.game_code
      and g.phase = 'vote_phase'
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
  gm_id uuid;
  favorite_target_id uuid;
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

  if game_row.phase <> 'vote_phase' and p_phase = 'vote_phase' then
    delete from public.votes where game_code = p_game_code;
    update public.games
    set decoy_favorite_id = null
    where game_code = p_game_code;
    update public.profiles
    set current_score = 0
    where game_code = p_game_code
      and is_gm = false;
  end if;

  if game_row.phase = 'vote_phase' and p_phase <> 'vote_phase' then
    select p.id into gm_id
    from public.profiles p
    where p.game_code = p_game_code
      and p.is_gm = true
    limit 1;

    select favorite.target_id into favorite_target_id
    from public.votes favorite
    where favorite.game_code = p_game_code
      and favorite.vote_kind = 'decoy_favorite'
      and favorite.status <> 'unlocked'
    order by favorite.updated_at desc
    limit 1;

    update public.profiles p
    set current_score = totals.points,
        score = p.score + totals.points
    from (
      select player.id,
        coalesce(sum(
          case v.status
            when 'correct' then game_row.correct_score
            when 'exists' then game_row.exist_score
            when 'none' then 0
            else 0
          end
        ), 0)::integer as points
      from public.profiles player
      left join public.votes v
        on v.voter_id = player.id
        and v.game_code = p_game_code
        and v.vote_kind = 'guess'
      where player.game_code = p_game_code
        and player.is_gm = false
      group by player.id
    ) totals
    where p.id = totals.id;

    update public.profiles target
    set current_score = target.current_score + game_row.decoy_score,
        score = target.score + game_row.decoy_score
    where target.id = favorite_target_id
      and target.is_gm = false;

    update public.games
    set decoy_favorite_id = favorite_target_id
    where game_code = p_game_code;

    insert into public.chats (
      game_code,
      name,
      description,
      created_by,
      chat_type
    )
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

    insert into public.messages (chat_id, sender_id, content)
    select
      c.id,
      gm_id,
      format(
        'Round results: You guessed %s person%s exactly correctly. You guessed %s person%s that existed in the game but for the wrong character.',
        count(*) filter (where v.vote_kind = 'guess' and v.status = 'correct'),
        case when count(*) filter (where v.vote_kind = 'guess' and v.status = 'correct') = 1 then '' else 's' end,
        count(*) filter (where v.vote_kind = 'guess' and v.status = 'exists'),
        case when count(*) filter (where v.vote_kind = 'guess' and v.status = 'exists') = 1 then '' else 's' end
      )
    from public.chats c
    join public.profiles player on player.id = c.created_by
    left join public.votes v
      on v.voter_id = player.id
     and v.game_code = p_game_code
    where c.game_code = p_game_code
      and c.chat_type = 'with_gm'
      and player.is_gm = false
      and player.is_decoy = false
    group by c.id;

    insert into public.messages (chat_id, sender_id, content)
    select
      c.id,
      gm_id,
      'This Round, You were chosen as the favorite character.'
    from public.chats c
    join public.profiles player on player.id = c.created_by
    where c.game_code = p_game_code
      and c.chat_type = 'with_gm'
      and player.id = favorite_target_id;
  end if;

  update public.games
  set phase = p_phase
  where game_code = p_game_code
  returning * into game_row;

  return game_row;
end;
$$;

revoke execute on function public.change_game_phase(varchar(4), public.game_phase) from public;
grant execute on function public.change_game_phase(varchar(4), public.game_phase) to authenticated;

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
