"use client";

import { useState } from "react";
import { MessageCircle, Users } from "lucide-react";
import Image from "next/image";
import { ChatBox } from "@/components/chat-box";
import {
  markChatRead,
  useUnreadChatCounts,
} from "@/hooks/use-unread-chat-counts";
import type { Chat, GamePhase, Profile } from "@/types/database";

export function GmPanel({
  players,
  chats,
  currentUserId,
  gameCode,
  initialPhase,
}: {
  players: Profile[];
  chats: Chat[];
  currentUserId: string;
  gameCode: string;
  initialPhase: GamePhase;
}) {
  const [phase, setPhase] = useState(initialPhase);
  const [phaseError, setPhaseError] = useState("");
  const [phaseBusy, setPhaseBusy] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState(
    chats.find((chat) => chat.chat_type === "public")?.id ?? chats[0]?.id ?? "",
  );
  const selectedChat = chats.find((chat) => chat.id === selectedChatId) ?? null;
  const gameChats = chats.filter((chat) => chat.chat_type !== "with_gm");
  const gmChats = chats.filter((chat) => chat.chat_type === "with_gm");
  const unreadCounts = useUnreadChatCounts(chats, currentUserId);

  function selectChat(chatId: string) {
    markChatRead(currentUserId, chatId);
    setSelectedChatId(chatId);
  }

  async function changePhase(nextPhase: GamePhase) {
    setPhaseBusy(true);
    setPhaseError("");
    const response = await fetch(`/api/games/${gameCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: nextPhase }),
    });
    const result = await response.json();
    if (response.ok) setPhase(result.phase as GamePhase);
    else setPhaseError(result.error ?? "Could not update game phase.");
    setPhaseBusy(false);
  }

  return (
    <section className="mt-10">
      <div className="mb-5">
        <p className="text-sm text-[var(--accent)]">Game master panel</p>
        <h2 className="mt-1 text-2xl font-semibold">Players and conversations</h2>
      </div>
      <div className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <label className="flex items-center justify-between gap-3 text-sm font-semibold">
        Game phase
        <select
          value={phase}
          onChange={(event) => void changePhase(event.target.value as GamePhase)}
          disabled={phaseBusy}
          className="rounded-lg border border-[var(--line)] bg-[#050505] px-3 py-2 text-sm font-normal outline-none focus:border-[var(--accent)]"
        >
          <option value="not_started">Not started</option>
          <option value="chat_phase">Chat phase</option>
          <option value="vote_phase">Vote phase</option>
        </select>
        </label>
        {phaseError && (
          <p role="alert" className="mt-2 text-sm text-rose-300">
            {phaseError}
          </p>
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-[220px_1fr_260px]">
        <aside className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Users size={16} /> Players ({players.length})
          </div>
          <div className="space-y-2">
            {players.map((player) => (
              <div key={player.id} className="flex items-center gap-3 rounded-xl p-2">
                <Avatar profile={player} />
                <span className="truncate text-sm">
                  {player.display_name || "Unnamed player"}
                </span>
              </div>
            ))}
            {!players.length && (
              <p className="text-sm text-[var(--muted)]">No players yet.</p>
            )}
          </div>
        </aside>
        <ChatBox
          key={selectedChat?.id ?? "empty"}
          chat={selectedChat}
          currentUserId={currentUserId}
          canSend
          canManage
        />
        <aside className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <MessageCircle size={16} /> Game chats
          </div>
          <div className="space-y-2">
            {gameChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => selectChat(chat.id)}
                className={`relative w-full rounded-xl border px-3 py-3 pr-10 text-left text-sm ${chat.id === selectedChatId ? "border-[var(--accent)] bg-[#2a0a0a]" : "border-transparent hover:border-[var(--line)]"}`}
              >
                <span className="block font-medium">{chat.name}</span>
                <span className="text-xs text-[var(--muted)]">
                  {chat.chat_type} · {chat.status}
                </span>
                {unreadCounts[chat.id] > 0 && (
                  <UnreadBadge count={unreadCounts[chat.id]} />
                )}
              </button>
            ))}
            {!gameChats.length && (
              <p className="text-sm text-[var(--muted)]">No chats yet.</p>
            )}
          </div>
          <div className="mt-6 border-t border-[var(--line)] pt-4">
            <div className="mb-3 text-sm font-semibold text-[var(--accent)]">
              Game master conversations
            </div>
            <div className="space-y-2">
              {gmChats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => selectChat(chat.id)}
                  className={`relative w-full rounded-xl border px-3 py-3 pr-10 text-left text-sm ${chat.id === selectedChatId ? "border-[var(--accent)] bg-[#2a0a0a]" : "border-transparent hover:border-[var(--line)]"}`}
                >
                  <span className="block font-medium">{chat.name}</span>
                  <span className="text-xs text-[var(--muted)]">
                    Player conversation · {chat.status}
                  </span>
                  {unreadCounts[chat.id] > 0 && (
                    <UnreadBadge count={unreadCounts[chat.id]} />
                  )}
                </button>
              ))}
              {!gmChats.length && (
                <p className="text-sm text-[var(--muted)]">
                  No player GM chats yet.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="absolute right-2 top-2 grid min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-xs font-bold text-[#050505]">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function Avatar({ profile }: { profile: Profile }) {
  return profile.profile_image_url ? (
    <Image
      src={profile.profile_image_url}
      alt=""
      width={36}
      height={36}
      unoptimized
      className="h-9 w-9 rounded-full object-cover"
    />
  ) : (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#2a0a0a] text-xs font-semibold text-[var(--accent)]">
      {(profile.display_name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
