"use client";

import { useState } from "react";
import { MessageCircle, UserRound } from "lucide-react";
import Image from "next/image";
import { DashboardChat } from "@/components/dashboard-chat";
import type { Chat, Profile } from "@/types/database";

export function PlayerPanel({
  players,
  initialChats,
  currentUserId,
  gameCode,
}: {
  players: Profile[];
  initialChats: Chat[];
  currentUserId: string;
  gameCode: string;
}) {
  const [chats, setChats] = useState(initialChats);
  const [selectedChatId, setSelectedChatId] = useState(
    initialChats.find((chat) => chat.chat_type === "public")?.id ??
      initialChats[0]?.id ??
      "",
  );
  const [error, setError] = useState("");
  const [busyPlayerId, setBusyPlayerId] = useState("");
  const selectedChat = chats.find((chat) => chat.id === selectedChatId) ?? null;

  async function openPrivateChat(player: Profile) {
    if (player.id === currentUserId) return;
    setBusyPlayerId(player.id);
    setError("");
    const response = await fetch("/api/chats/private", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: player.id, game_code: gameCode }),
    });
    const result = await response.json();
    if (response.ok) {
      setChats((old) => [
        ...old.filter((chat) => chat.id !== result.id),
        result as Chat,
      ]);
      setSelectedChatId(result.id);
    } else setError(result.error ?? "Could not open private chat.");
    setBusyPlayerId("");
  }

  return (
    <section className="mt-10">
      <div className="mb-5">
        <p className="text-sm text-[var(--accent)]">Player panel</p>
        <h2 className="mt-1 text-2xl font-semibold">Your game room</h2>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => setSelectedChatId(chat.id)}
                className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm ${chat.id === selectedChatId ? "border-[var(--accent)] bg-[#2a0a0a]" : "border-[var(--line)]"}`}
              >
                {chat.chat_type === "public" ? <MessageCircle size={15} /> : null}
                {chat.name}
              </button>
            ))}
            {!chats.length && (
              <p className="text-sm text-[var(--muted)]">
                The game master has not opened a public chat yet.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="mb-3 text-sm text-rose-300">
              {error}
            </p>
          )}
          <DashboardChat
            key={selectedChat?.id ?? "empty"}
            chat={selectedChat}
            currentUserId={currentUserId}
            canSend
            canManage={false}
          />
        </div>
        <aside className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <UserRound size={16} /> Players
          </div>
          <div className="space-y-2">
            {players.map((player) => (
              <button
                key={player.id}
                type="button"
                disabled={player.id === currentUserId || busyPlayerId === player.id}
                onClick={() => openPrivateChat(player)}
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-[#2a0a0a] disabled:cursor-default disabled:opacity-60"
                title={
                  player.id === currentUserId
                    ? "This is you"
                    : "Open a private chat"
                }
              >
                <Avatar profile={player} />
                <span className="truncate text-sm">
                  {player.display_name || "Unnamed player"}
                  {player.id === currentUserId ? " (you)" : ""}
                </span>
              </button>
            ))}
            {!players.length && (
              <p className="text-sm text-[var(--muted)]">No players yet.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
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
