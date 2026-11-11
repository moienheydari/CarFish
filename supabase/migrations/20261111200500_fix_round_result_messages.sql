alter table public.rounds
  add column if not exists results_sent_at timestamptz;

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
