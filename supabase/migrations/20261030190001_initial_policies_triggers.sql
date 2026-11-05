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

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger profiles_role_fields before update on public.profiles
for each row execute function public.protect_profile_role_fields();
create trigger chats_updated_at before update on public.chats
for each row execute function public.touch_updated_at();
create trigger private_chat_members_limit before insert on public.chat_members
for each row execute function public.enforce_private_chat_members_limit();

drop policy if exists "authenticated users read games" on public.games;
drop policy if exists "authenticated users create games" on public.games;
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
drop policy if exists "Users upload their own profile images" on storage.objects;
drop policy if exists "Users replace their own profile images" on storage.objects;
drop policy if exists "Users delete their own profile images" on storage.objects;
drop policy if exists "Private chat creators add their recipient" on public.chat_members;
drop policy if exists "Game masters read game messages" on public.messages;
drop policy if exists "Players read open public game messages" on public.messages;
drop policy if exists "Players send open public game messages" on public.messages;
drop policy if exists "Game masters send game messages" on public.messages;
drop policy if exists "Game masters update game chat state" on public.chats;

create policy "authenticated users read games" on public.games
for select to authenticated using (true);
create policy "authenticated users create games" on public.games
for insert to authenticated
with check (true);
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
create policy "members send messages" on public.messages
for insert to authenticated with check (
  sender_id = auth.uid()
  and exists (select 1 from public.chat_members m where m.chat_id = messages.chat_id and m.user_id = auth.uid())
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
    where c.id = messages.chat_id
      and c.status = 'open'
      and gm.is_gm = true
      and gm.game_code = c.game_code
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
