"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/browser";
import { markChatRead } from "@/hooks/use-unread-chat-counts";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Chat, Message, Profile } from "@/types/database";

const MAX_RETAINED_MESSAGES = 200;

export function ChatBox({
  chat,
  currentUserId,
  canSend,
  canManage,
  canSendWhenClosed = false,
  mentionableProfiles,
}: {
  chat: Chat | null;
  currentUserId: string;
  canSend: boolean;
  canManage: boolean;
  canSendWhenClosed?: boolean;
  mentionableProfiles?: Profile[];
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mentionContext, setMentionContext] = useState<{ start: number; end: number; query: string } | null>(null);
  const [highlightedMention, setHighlightedMention] = useState(0);
  const [status, setStatus] = useState<Chat["status"]>(chat?.status ?? "locked");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatId = chat?.id;
  const mentionSuggestions = mentionContext
    ? (mentionableProfiles ?? [])
      .filter((profile) => profile.id !== currentUserId && profile.display_name?.trim())
      .filter((profile) =>
        profile.display_name!.toLocaleLowerCase().startsWith(mentionContext.query.toLocaleLowerCase()),
      )
      .slice(0, 6)
    : [];

  useEffect(() => {
    if (!chatId || !canSend || status !== "open") return;
    inputRef.current?.focus();
  }, [chatId, canSend, status]);

  const mergeMessages = useCallback((existing: Message[], incoming: Message[]) => {
    const byId = new Map(existing.map((message) => [message.id, message]));
    incoming.forEach((message) => byId.set(message.id, message));
    return [...byId.values()].sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime() ||
        left.id.localeCompare(right.id),
    ).slice(-MAX_RETAINED_MESSAGES);
  }, []);

  const loadStatus = useCallback(async () => {
    if (!chatId) return;
    const response = await fetch(`/api/chats/${chatId}/state`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to load chat status.");
    setStatus(result.status as Chat["status"]);
  }, [chatId]);

  const loadHistory = useCallback(async () => {
    if (!chatId) return;
    const response = await fetch(`/api/chats/${chatId}/messages`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to load messages.");
    setMessages(result.messages as Message[]);
    setHasOlderMessages(Boolean(result.has_more));
  }, [chatId]);

  const loadOlderMessages = useCallback(async () => {
    if (!chatId || !hasOlderMessages || loadingOlderMessages || messages.length >= MAX_RETAINED_MESSAGES)
      return;
    const oldestMessage = messages[0];
    if (!oldestMessage) return;
    setLoadingOlderMessages(true);
    setError("");
    try {
      const params = new URLSearchParams({
        before_created_at: oldestMessage.created_at,
        before_id: oldestMessage.id,
      });
      const response = await fetch(`/api/chats/${chatId}/messages?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load older messages.");
      setMessages((current) => mergeMessages(current, result.messages as Message[]));
      setHasOlderMessages(Boolean(result.has_more));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load older messages.");
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [chatId, hasOlderMessages, loadingOlderMessages, messages, mergeMessages]);

  const loadMessage = useCallback(async (messageId: string) => {
    if (!chatId) return;
    const { data } = await createClient()
      .from("messages")
      .select(
        "*, sender:profiles!messages_sender_id_fkey(display_name,profile_image_url)",
      )
      .eq("id", messageId)
      .single();
    if (data) {
      void markChatRead(chatId);
      setMessages((old) => mergeMessages(old, [data as Message]));
    }
  }, [chatId, mergeMessages]);

  const configure = useCallback(
    (channel: RealtimeChannel) => {
      if (!chatId) return channel;
      return channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `chat_id=eq.${chatId}`,
          },
          (payload) => {
            void loadMessage(payload.new.id as string);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "chats",
            filter: `id=eq.${chatId}`,
          },
          (payload) => {
            setStatus(payload.new.status as Chat["status"]);
          },
        );
    },
    [chatId, loadMessage],
  );
  useRealtimeChannel(`dashboard-chat-${chatId ?? "none"}`, configure, (channelStatus) => {
    if (channelStatus !== "SUBSCRIBED") return;
    void loadStatus().catch((caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load chat status.");
    });
    void loadHistory().catch((caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load messages.");
    });
  });

  useEffect(() => {
    if (!chatId) return;
    void markChatRead(chatId);
    queueMicrotask(() => {
      void loadHistory().catch((caughtError) => {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load messages.");
      });
      void loadStatus().catch((caughtError) => {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load chat status.");
      });
    });
  }, [chatId, currentUserId, loadHistory, loadStatus]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!chat || !content.trim() || busy || (!canSendWhenClosed && status !== "open") || !canSend)
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send message.");
      setMessages((old) => mergeMessages(old, [result as Message]));
      setContent("");
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not send message.");
    } finally {
      setBusy(false);
    }
  }

  function updateMentionContext(value: string, cursor: number) {
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) {
      setMentionContext(null);
      return;
    }
    const queryStart = cursor - match[1].length;
    setMentionContext({ start: queryStart - 1, end: cursor, query: match[1] });
    setHighlightedMention(0);
  }

  function chooseMention(profile: Profile) {
    if (!mentionContext) return;
    const mention = `@${profile.display_name} `;
    const nextContent =
      content.slice(0, mentionContext.start) +
      mention +
      content.slice(mentionContext.end);
    const nextCursor = mentionContext.start + mention.length;
    setContent(nextContent);
    setMentionContext(null);
    setHighlightedMention(0);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function renderMessageContent(messageContent: string) {
    const mentionNames = (mentionableProfiles ?? [])
      .map((profile) => profile.display_name?.trim())
      .filter((name): name is string => Boolean(name))
      .sort((left, right) => right.length - left.length);
    if (!mentionNames.length) return messageContent;

    const escapedNames = mentionNames.map((name) =>
      name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    const mentionPattern = new RegExp(`(@(?:${escapedNames.join("|")}))`, "g");
    return messageContent.split(mentionPattern).map((part, index) =>
      index % 2 === 1 ? (
        <span key={`${part}-${index}`} className="text-blue-400">
          {part}
        </span>
      ) : (
        part
      ),
    );
  }

  async function toggleStatus() {
    if (!chat) return;
    setBusy(true);
    setError("");
    const nextStatus = status === "open" ? "locked" : "open";
    try {
      const response = await fetch(`/api/chats/${chat.id}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not change chat status.");
      setStatus(result.status);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not change chat status.");
    } finally {
      setBusy(false);
    }
  }

  if (!chat)
    return (
      <div className="grid min-h-[80vh] place-items-center rounded-2xl border border-dashed border-[var(--line)] p-8 text-center text-[var(--muted)]">
        <p>Select a chat to read the conversation.</p>
      </div>
    );

  return (
    <section className="flex h-[80vh] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] p-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold">{chat.name}</h2>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${status === "open" ? "bg-emerald-700 text-white" : "bg-rose-900 text-rose-100"}`}>
            {status === "open" ? "Open" : "Closed"}
          </span>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={toggleStatus}
            disabled={busy}
            className="cursor-pointer rounded-full border border-[var(--accent)] px-2.5 py-1 text-[11px] text-[var(--accent)] transition hover:bg-[#2a0a0a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "open" ? "Close chat" : "Open chat"}
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-3">
        {hasOlderMessages && messages.length < MAX_RETAINED_MESSAGES && (
          <button
            type="button"
            onClick={() => void loadOlderMessages()}
            disabled={loadingOlderMessages}
            className="w-full cursor-pointer rounded-xl border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)] hover:bg-[#2a0a0a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingOlderMessages ? "Loading older messages..." : "Load older messages"}
          </button>
        )}
        {messages.length ?
          messages.map((message, index) => {
            const isOwnMessage = message.sender_id === currentUserId;
            const isFirstFromSender =
              index === 0 || messages[index - 1]?.sender_id !== message.sender_id;
            const timestamp = new Date(message.created_at).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            });

            return (
              <div
                key={message.id}
                className={`flex items-start gap-2 ${isFirstFromSender ? "mt-2" : ""}`}
              >
                {!isOwnMessage && (
                  isFirstFromSender ? (
                    message.sender?.profile_image_url ? (
                      <Image
                        src={message.sender.profile_image_url}
                        alt=""
                        width={50}
                        height={50}
                        unoptimized
                        className="h-12 w-12 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#2a0a0a] text-sm font-semibold text-[var(--accent)]">
                        {(message.sender?.display_name || "?").slice(0, 1).toUpperCase()}
                      </span>
                    )
                  ) : (
                    <span className="w-10 shrink-0" aria-hidden />
                  )
                )}
                <div className={isOwnMessage ? "min-w-0 flex-1 text-right" : "min-w-0 flex-1"}>
                  {isFirstFromSender && (
                    <p className={`text-[16px] text-[var(--accent)] ${isOwnMessage ? "text-right" : ""}`}>
                      {message.sender?.display_name || "participant"}
                    </p>
                  )}
                  <div className={`flex items-baseline gap-1 ${isOwnMessage ? "justify-end" : ""}`}>
                    <span className="text-[9px] text-[var(--muted)]">{timestamp}</span>
                    <p
                      className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-2 py-1 text-sm ${isOwnMessage ? "rounded-tr-sm bg-[#770404] text-[#f8eaea]" : "rounded-tl-sm bg-[#2a0a0a]"}`}
                    >
                      {renderMessageContent(message.content)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
          : (
            <div className="grid h-full min-h-32 place-items-center text-center text-xs text-[var(--muted)]">
              {status === "open" ? "No messages yet." : "This chat is closed to players."}
            </div>
          )}
        <div ref={endRef} />
      </div>
      {error && (
        <p role="alert" className="border-t border-[var(--line)] px-3 py-1 text-xs text-rose-300">
          {error}
        </p>
      )}
      {canSend && (status === "open" || canSendWhenClosed) && (
        <form onSubmit={send} className="border-t border-[var(--line)] p-2">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              {mentionSuggestions.length > 0 && (
                <ul
                  role="listbox"
                  aria-label="Mention someone"
                  className="absolute bottom-full left-0 right-0 mb-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[#050505] shadow-lg"
                >
                  {mentionSuggestions.map((profile, index) => (
                    <li key={profile.id} role="option" aria-selected={index === highlightedMention}>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          chooseMention(profile);
                        }}
                        className={`flex w-full cursor-pointer items-center justify-between px-2 py-1 text-left text-s ${index === highlightedMention ? "bg-[#2a0a0a]" : "hover:bg-[#2a0a0a]"}`}
                      >
                        <span>@{profile.display_name}</span>
                        {profile.is_gm && <span className="text-xs text-[var(--muted)]">GM</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <textarea
                ref={inputRef}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  updateMentionContext(event.target.value, event.target.selectionStart);
                }}
                onKeyDown={(event) => {
                  if (mentionSuggestions.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                    event.preventDefault();
                    setHighlightedMention((current) =>
                      event.key === "ArrowDown"
                        ? (current + 1) % mentionSuggestions.length
                        : (current - 1 + mentionSuggestions.length) % mentionSuggestions.length,
                    );
                    return;
                  }
                  if (mentionSuggestions.length > 0 && (event.key === "Enter" || event.key === "Tab")) {
                    event.preventDefault();
                    chooseMention(mentionSuggestions[highlightedMention]);
                    return;
                  }
                  if (event.key === "Escape" && mentionContext) {
                    event.preventDefault();
                    setMentionContext(null);
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                maxLength={500}
                rows={1}
                placeholder="Write a message..."
                className="h-9 w-full resize-none rounded-lg border border-[var(--line)] bg-[#050505] px-3 py-1 text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>
            <button
              disabled={busy}
              className="h-9 cursor-pointer rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[#050505] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
