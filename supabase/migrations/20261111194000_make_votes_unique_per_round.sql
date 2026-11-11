with duplicate_votes as (
  select
    id,
    row_number() over (
      partition by game_code, voter_id, target_id, round_id
      order by updated_at desc, created_at desc, id desc
    ) as duplicate_rank
  from public.votes
)
delete from public.votes as votes
using duplicate_votes
where votes.id = duplicate_votes.id
  and duplicate_votes.duplicate_rank > 1;

alter table public.votes
  add constraint votes_game_voter_target_round_unique
  unique (game_code, voter_id, target_id, round_id);
