"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
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
) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const chatIdsKey = chats.map((chat) => chat.id).join(",");

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const chatIds = chatIdsKey ? chatIdsKey.split(",") : [];

    async function loadCounts() {
      const entries = await Promise.all(
        chatIds.map(async (chatId) => {
          const response = await fetch(`/api/chats/${chatId}/messages`);
          if (!response.ok) return [chatId, 0] as const;
          const messages = (await response.json()) as {
            created_at: string;
            sender_id: string;
          }[];
          const readAt = getReadAt(currentUserId, chatId);
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
      if (active) setCounts(Object.fromEntries(entries));
    }

    void loadCounts();
    const chatIdSet = new Set(chatIds);
    const channel = supabase
      .channel(`unread-chats-${currentUserId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const chatId = payload.new.chat_id as string;
          if (
            !active ||
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
        },
      )
      .subscribe();

    function handleRead(event: Event) {
      const chatId = (event as CustomEvent<string>).detail;
      if (chatIdSet.has(chatId))
        setCounts((old) => ({ ...old, [chatId]: 0 }));
    }
    window.addEventListener(READ_EVENT, handleRead);

    return () => {
      active = false;
      window.removeEventListener(READ_EVENT, handleRead);
      void supabase.removeChannel(channel);
    };
  }, [chatIdsKey, currentUserId]);

  return counts;
}
