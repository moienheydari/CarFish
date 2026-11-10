alter table public.chat_members
  add column last_read_at timestamptz;

create index chat_members_user_read_idx
  on public.chat_members(user_id, chat_id, last_read_at);

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
