create type public.round_status as enum ('active', 'finalized');

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

create table public.round_scores (
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null check (points >= 0),
  primary key (round_id, user_id)
);

alter table public.votes
  add column round_id uuid references public.rounds(id) on delete cascade;

insert into public.rounds (game_code, round_number, status, finalized_at)
select
  g.game_code,
  1,
  case when g.phase = 'final' then 'finalized'::public.round_status else 'active'::public.round_status end,
  case when g.phase = 'final' then now() else null end
from public.games g
on conflict (game_code, round_number) do nothing;

update public.votes v
set round_id = r.id
from public.rounds r
where r.game_code = v.game_code
  and r.round_number = 1;

alter table public.votes
  alter column round_id set not null;

alter table public.rounds enable row level security;
alter table public.round_scores enable row level security;

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

create index rounds_game_code_idx on public.rounds(game_code, round_number desc);
create index round_scores_user_id_idx on public.round_scores(user_id);
create index votes_round_id_idx on public.votes(round_id);

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

    select p.id into gm_id
    from public.profiles p
    where p.game_code = p_game_code
      and p.is_gm = true
    limit 1;

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
     and v.round_id = active_round.id
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

revoke execute on function public.change_game_phase(varchar(4), public.game_phase) from public;
grant execute on function public.change_game_phase(varchar(4), public.game_phase) to authenticated;

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

drop policy if exists "Players lock votes" on public.votes;
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

drop policy if exists "Players relock unlocked votes" on public.votes;
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
