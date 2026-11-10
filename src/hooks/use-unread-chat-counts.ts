"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Chat } from "@/types/database";

const READ_EVENT = "chat-read";

function readKey(userId: string, chatId: string) {
  return `chat-read-${userId}-${chatId}`;
}

function getReadAt(userId: string, chatId: string) {
  return localStorage.getItem(readKey(userId, chatId)) ?? "";
}

export function markChatRead(userId: string, chatId: string) {
  localStorage.setItem(readKey(userId, chatId), new Date().toISOString());
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
    const entries = await Promise.all(
      chatIds.map(async (chatId) => {
        const response = await fetch(`/api/chats/${chatId}/messages`);
        if (!response.ok) return [chatId, 0] as const;
        const messages = (await response.json()) as {
          created_at: string;
          sender_id: string;
        }[];
        const readAt = getReadAt(currentUserId, chatId);
        if (!readAt && messages.length) {
          const latestMessage = messages.reduce((latest, message) =>
            message.created_at > latest.created_at ? message : latest,
          );
          localStorage.setItem(
            readKey(currentUserId, chatId),
            latestMessage.created_at,
          );
          return [chatId, 0] as const;
        }
        return [
          chatId,
          messages.filter(
            (message) =>
              message.sender_id !== currentUserId &&
              (!readAt || message.created_at > readAt),
          ).length,
        ] as const;
      }),
    );
    setCounts(Object.fromEntries(entries));
  }, [chatIds, currentUserId]);

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
            const readAt = getReadAt(currentUserId, chatId);
            if (payload.new.created_at <= readAt) return;
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
