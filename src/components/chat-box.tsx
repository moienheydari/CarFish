"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
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

    let active = true;
    const supabase = createClient();
    void fetch(`/api/chats/${chat.id}/messages`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load messages.");
        if (active) setMessages(result as Message[]);
      })
      .catch((caughtError) => {
        if (active)
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load messages.",
          );
      });

    const channel = supabase
      .channel(`dashboard-chat-${chat.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chat.id}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from("messages")
            .select(
              "*, sender:profiles!messages_sender_id_fkey(display_name,profile_image_url)",
            )
            .eq("id", payload.new.id)
            .single();
          if (active && data)
            setMessages((old) =>
              old.some((item) => item.id === data.id)
                ? old
                : [...old, data as Message],
            );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chats",
          filter: `id=eq.${chat.id}`,
        },
        (payload) => {
          if (active) setStatus(payload.new.status as Chat["status"]);
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [chat]);

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
    <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
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
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
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
