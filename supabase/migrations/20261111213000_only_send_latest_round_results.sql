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
    on v.voter_id = player.ide
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

revoke execute on function public.send_round_results(varchar(4)) from public;
grant execute on function public.send_round_results(varchar(4)) to authenticated;
