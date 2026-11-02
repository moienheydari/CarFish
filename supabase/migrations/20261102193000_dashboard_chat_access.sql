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
      and c.chat_type = 'private'
      and c.created_by = (select auth.uid())
      and c.status = 'open'
      and creator.game_code = recipient.game_code
      and recipient.is_gm = false
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

create policy "Players read open public game messages"
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
      and c.status = 'open'
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
