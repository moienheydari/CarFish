"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import { createClient } from "@/lib/supabase/browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Chat } from "@/types/database";

const READ_EVENT = "chat-read";

export async function markChatRead(chatId: string) {
  const { error } = await createClient().rpc("mark_chat_read", {
    p_chat_id: chatId,
  });
  if (error) {
    console.error("Could not mark chat as read.", {
      chatId,
      code: error.code,
      message: error.message,
    });
  }
  window.dispatchEvent(new CustomEvent(READ_EVENT, { detail: chatId }));
}

export function useUnreadChatCounts(
  chats: Chat[],
  currentUserId: string,
  onNewUnread?: (chatId: string) => void,
) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const chatIdsKey = chats.map((chat) => chat.id).join(",");
  const chatIds = useMemo(
    () => (chatIdsKey ? chatIdsKey.split(",") : []),
    [chatIdsKey],
  );
  const chatIdSet = useMemo(() => new Set(chatIds), [chatIds]);
  const onNewUnreadRef = useRef(onNewUnread);
  useEffect(() => {
    onNewUnreadRef.current = onNewUnread;
  }, [onNewUnread]);

  const loadCounts = useCallback(async () => {
    if (!chatIds.length) {
      setCounts({});
      return;
    }
    const { data, error } = await createClient().rpc("get_unread_chat_counts", {
      p_chat_ids: chatIds,
    });
    if (error) {
      console.error("Could not load unread chat counts.", {
        code: error.code,
        message: error.message,
      });
      return;
    }
    const nextCounts = Object.fromEntries(
      ((data ?? []) as { chat_id: string; unread_count: number | string }[]).map(
        (entry) => [entry.chat_id, Number(entry.unread_count)],
      ),
    );
    setCounts(
      Object.fromEntries(chatIds.map((chatId) => [chatId, nextCounts[chatId] ?? 0])),
    );
  }, [chatIds]);

  const configure = useCallback(
    (channel: RealtimeChannel) =>
      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const chatId = payload.new.chat_id as string;
            if (
              !chatIdSet.has(chatId) ||
              payload.new.sender_id === currentUserId
            )
              return;
            setCounts((old) => ({
              ...old,
              [chatId]: (old[chatId] ?? 0) + 1,
            }));
            onNewUnreadRef.current?.(chatId);
          },
        ),
    [chatIdSet, currentUserId, onNewUnreadRef],
  );

  useRealtimeChannel(`unread-chats-${currentUserId}`, configure, (status) => {
    if (status === "SUBSCRIBED") void loadCounts();
  });

  useEffect(() => {
    queueMicrotask(() => void loadCounts());

    function handleRead(event: Event) {
      const chatId = (event as CustomEvent<string>).detail;
      if (chatIdSet.has(chatId))
        setCounts((old) => ({ ...old, [chatId]: 0 }));
    }
    window.addEventListener(READ_EVENT, handleRead);

    return () => {
      window.removeEventListener(READ_EVENT, handleRead);
    };
  }, [chatIdSet, currentUserId, loadCounts]);

  return counts;
}
