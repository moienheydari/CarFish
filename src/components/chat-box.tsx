"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import {
  markChatRead,
  MESSAGE_EVENT,
} from "@/hooks/use-unread-chat-counts";
import type { Chat, Message } from "@/types/database";

export function ChatBox({
  chat,
  currentUserId,
  canSend,
  canManage,
}: {
  chat: Chat | null;
  currentUserId: string;
  canSend: boolean;
  canManage: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Chat["status"]>(chat?.status ?? "locked");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chat) return;

    const activeChat = chat;
    markChatRead(currentUserId, activeChat.id);
    let active = true;
    const supabase = createClient();
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let connecting = false;

    function mergeMessages(
      existing: Message[],
      incoming: Message[],
    ): Message[] {
      const byId = new Map(existing.map((message) => [message.id, message]));
      incoming.forEach((message) => byId.set(message.id, message));
      return [...byId.values()].sort(
        (left, right) =>
          new Date(left.created_at).getTime() -
          new Date(right.created_at).getTime(),
      );
    }

    async function loadHistory() {
      const response = await fetch(`/api/chats/${activeChat.id}/messages`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load messages.");
      if (active) setMessages((old) => mergeMessages(old, result as Message[]));
    }

    async function loadMessage(messageId: string) {
      const { data } = await supabase
        .from("messages")
        .select(
          "*, sender:profiles!messages_sender_id_fkey(display_name,profile_image_url)",
        )
        .eq("id", messageId)
        .single();
      if (active && data) {
        markChatRead(currentUserId, activeChat.id);
        setMessages((old) => mergeMessages(old, [data as Message]));
      }
    }

    function handleMessage(event: Event) {
      const detail = (event as CustomEvent<{
        chatId: string;
        messageId: string;
      }>).detail;
      if (detail.chatId === activeChat.id) void loadMessage(detail.messageId);
    }
    window.addEventListener(MESSAGE_EVENT, handleMessage);

    void loadHistory()
      .catch((caughtError) => {
        if (active)
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load messages.",
          );
      });

    async function subscribe() {
      if (!active || connecting || channel) return;
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
        .channel(`dashboard-chat-${activeChat.id}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            if (payload.new.chat_id === activeChat.id)
              void loadMessage(payload.new.id as string);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "chats",
            filter: `id=eq.${activeChat.id}`,
          },
          (payload) => {
            if (active) setStatus(payload.new.status as Chat["status"]);
          },
        )
        .subscribe((status) => {
          if (!active) return;
          connecting = false;
          if (status === "SUBSCRIBED") {
            void loadHistory().catch((caughtError) => {
              if (active)
                setError(
                  caughtError instanceof Error
                    ? caughtError.message
                    : "Unable to load messages.",
                );
            });
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            const failedChannel = channel;
            channel = null;
            if (failedChannel) void supabase.removeChannel(failedChannel);
            reconnectTimer = setTimeout(() => void subscribe(), 1000);
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

    return () => {
      active = false;
      window.removeEventListener(MESSAGE_EVENT, handleMessage);
      authSubscription.unsubscribe();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [chat, currentUserId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!chat || !content.trim() || busy || status !== "open" || !canSend)
      return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const result = await response.json();
    if (response.ok) {
      setMessages((old) =>
        old.some((item) => item.id === result.id) ? old : [...old, result],
      );
      setContent("");
    } else setError(result.error ?? "Could not send message.");
    setBusy(false);
  }

  async function toggleStatus() {
    if (!chat) return;
    setBusy(true);
    setError("");
    const nextStatus = status === "open" ? "locked" : "open";
    const response = await fetch(`/api/chats/${chat.id}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const result = await response.json();
    if (response.ok) setStatus(result.status);
    else setError(result.error ?? "Could not change chat status.");
    setBusy(false);
  }

  if (!chat)
    return (
      <div className="grid min-h-[28rem] place-items-center rounded-2xl border border-dashed border-[var(--line)] p-8 text-center text-[var(--muted)]">
        <p>Select a chat to read the conversation.</p>
      </div>
    );

  return (
    <section className="flex h-[28rem] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--accent)]">
            {chat.chat_type} chat · {status}
          </p>
          <h2 className="mt-1 font-semibold">{chat.name}</h2>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={toggleStatus}
            disabled={busy}
            className="rounded-full border border-[var(--accent)] px-3 py-2 text-xs text-[var(--accent)] disabled:opacity-50"
          >
            {status === "open" ? "Close chat" : "Open chat"}
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length ? (
          messages.map((message) => (
            <div
              key={message.id}
              className={message.sender_id === currentUserId ? "text-right" : ""}
            >
              <p className="mb-1 text-xs text-[var(--muted)]">
                {message.sender?.display_name || "participant"} ·{" "}
                {new Date(message.created_at).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              <p
                className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${message.sender_id === currentUserId ? "rounded-tr-sm bg-[var(--accent)] text-[#050505]" : "rounded-tl-sm bg-[#2a0a0a]"}`}
              >
                {message.content}
              </p>
            </div>
          ))
        ) : (
          <div className="grid h-full min-h-48 place-items-center text-center text-sm text-[var(--muted)]">
            {status === "open" ? "No messages yet." : "This chat is closed."}
          </div>
        )}
        <div ref={endRef} />
      </div>
      {error && (
        <p role="alert" className="border-t border-[var(--line)] px-4 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      {canSend && status === "open" && (
        <form onSubmit={send} className="border-t border-[var(--line)] p-3">
          <div className="flex gap-2">
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              maxLength={500}
              rows={1}
              placeholder="Write a message..."
              className="min-w-0 flex-1 resize-none rounded-xl border border-[var(--line)] bg-[#050505] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              disabled={busy}
              className="rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[#050505] disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
