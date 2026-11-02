"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import type { Message, Participant, Room } from "@/types/database";

export function RoomClient({
  room: initialRoom,
  initialMessages,
  participants: initialParticipants,
  currentUserId,
  initialMember,
}: {
  room: Room;
  initialMessages: Message[];
  participants: Participant[];
  currentUserId: string;
  initialMember: boolean;
}) {
  const [room, setRoom] = useState(initialRoom);
  const [messages, setMessages] = useState(initialMessages);
  const [participants] = useState(initialParticipants);
  const [member, setMember] = useState(initialMember);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!member) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`room-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${room.id}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from("messages")
            .select(
              "*, sender:profiles!messages_sender_id_fkey(username,display_name)",
            )
            .eq("id", payload.new.id)
            .single();
          if (data)
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
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        (payload) => setRoom((old) => ({ ...old, status: payload.new.status })),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [member, room.id]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);
  async function join() {
    const response = await fetch(`/api/rooms/${room.id}/join`, {
      method: "POST",
    });
    if (response.ok) {
      setMember(true);
      router.refresh();
    }
  }
  async function leave() {
    const response = await fetch(`/api/rooms/${room.id}/leave`, {
      method: "POST",
    });
    if (response.ok) {
      setMember(false);
      router.push("/rooms");
    } else setError("The host cannot leave their own room.");
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!content.trim() || busy) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/rooms/${room.id}/messages`, {
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
    } else setError(result.error);
    setBusy(false);
  }
  async function transition(status: "active" | "finished") {
    const response = await fetch(`/api/rooms/${room.id}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = await response.json();
    if (response.ok) setRoom((old) => ({ ...old, status: result.status }));
    else setError(result.error);
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <section className="flex min-h-[72vh] flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--accent)]">
                {room.status}
              </p>
              <h1 className="mt-1 text-2xl font-bold">{room.name}</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {room.description || "No room description."}
              </p>
            </div>
            <div className="flex gap-2">
              {room.created_by === currentUserId &&
                room.status !== "finished" && (
                  <button
                    onClick={() =>
                      transition(
                        room.status === "waiting" ? "active" : "finished",
                      )
                    }
                    className="rounded-full border border-[var(--accent)] px-3 py-2 text-xs text-[var(--accent)]"
                  >
                    {room.status === "waiting"
                      ? "Start session"
                      : "End session"}
                  </button>
                )}
              {member && room.created_by !== currentUserId && (
                <button
                  onClick={leave}
                  className="rounded-full border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]"
                >
                  Leave
                </button>
              )}
              {!member && (
                <button
                  onClick={join}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[#050505]"
                >
                  Join room
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!member ? (
            <div className="grid h-full place-items-center text-center text-[var(--muted)]">
              <p>Join this room to see and send messages.</p>
            </div>
          ) : messages.length ? (
            messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.sender_id === currentUserId ? "text-right" : ""
                }
              >
                <p className="mb-1 text-xs text-[var(--muted)]">
                  {message.sender?.display_name ||
                    message.sender?.username ||
                    "participant"}{" "}
                  ·{" "}
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
            <div className="grid h-full place-items-center text-[var(--muted)]">
              No messages yet. Start the conversation.
            </div>
          )}
          <div ref={endRef} />
        </div>
        {member && (
          <form onSubmit={send} className="border-t border-[var(--line)] p-4">
            <div className="flex gap-3">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                maxLength={500}
                rows={1}
                placeholder="Write a message..."
                className="min-w-0 flex-1 resize-none rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                disabled={busy}
                className="rounded-xl bg-[var(--accent)] px-4 font-semibold text-[#050505] disabled:opacity-50"
              >
                Send
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-2 text-sm text-rose-300">
                {error}
              </p>
            )}
          </form>
        )}
      </section>
      <aside className="h-fit rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <p className="text-sm font-semibold">
          Participants{" "}
          <span className="text-[var(--muted)]">({participants.length})</span>
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Host · @{room.host?.username ?? "unknown"}
        </p>
        <div className="mt-5 space-y-3">
          {participants.map((participant) => (
            <div
              key={participant.user_id}
              className="flex items-center gap-3 text-sm"
            >
              <span className="grid size-8 place-items-center rounded-full bg-[#2a0a0a] text-xs">
                {(participant.profile?.username ?? "?")[0]?.toUpperCase()}
              </span>
              <span>
                {participant.profile?.display_name ||
                  participant.profile?.username ||
                  "participant"}
                {participant.user_id === room.created_by && (
                  <span className="ml-2 text-xs text-[var(--accent)]">
                    host
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
