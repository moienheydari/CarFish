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
