"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { Chat } from "@/types/database";

const READ_EVENT = "chat-read";
export const MESSAGE_EVENT = "chat-message";

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
  const onNewUnreadRef = useRef(onNewUnread);
  useEffect(() => {
    onNewUnreadRef.current = onNewUnread;
  }, [onNewUnread]);

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
      if (active) setCounts(Object.fromEntries(entries));
    }

    void loadCounts();
    const chatIdSet = new Set(chatIds);
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let connecting = false;

    async function subscribe() {
      if (!active || connecting || channel || !chatIds.length) return;
      connecting = true;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) {
        connecting = false;
        return;
      }
      await supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`unread-chats-${currentUserId}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const chatId = payload.new.chat_id as string;
            if (
              !active ||
              !chatIdSet.has(chatId) ||
              payload.new.sender_id === currentUserId
            )
              return;
            window.dispatchEvent(
              new CustomEvent(MESSAGE_EVENT, {
                detail: {
                  chatId,
                  messageId: payload.new.id as string,
                },
              }),
            );
            const readAt = getReadAt(currentUserId, chatId);
            if (payload.new.created_at <= readAt) return;
            setCounts((old) => ({
              ...old,
              [chatId]: (old[chatId] ?? 0) + 1,
            }));
            onNewUnreadRef.current?.(chatId);
          },
        )
        .subscribe((status) => {
          if (!active) return;
          connecting = false;
          if (status === "SUBSCRIBED") {
            void loadCounts();
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            const failedChannel = channel;
            channel = null;
            if (failedChannel) void supabase.removeChannel(failedChannel);
            retryTimer = setTimeout(() => void subscribe(), 1000);
          }
        });
    }

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION"))
        void subscribe();
    });
    void subscribe();

    function handleRead(event: Event) {
      const chatId = (event as CustomEvent<string>).detail;
      if (chatIdSet.has(chatId))
        setCounts((old) => ({ ...old, [chatId]: 0 }));
    }
    window.addEventListener(READ_EVENT, handleRead);

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      authSubscription.unsubscribe();
      window.removeEventListener(READ_EVENT, handleRead);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [chatIdsKey, currentUserId]);

  return counts;
}
