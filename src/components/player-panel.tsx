"use client";

import { useState } from "react";
import { MessageCircle, UserRound } from "lucide-react";
import Image from "next/image";
import { DashboardChat } from "@/components/dashboard-chat";
import type { Chat, Profile } from "@/types/database";

export function PlayerPanel({
  players,
  initialChats,
  initialChatMembers,
  currentUserId,
  gameCode,
}: {
  players: Profile[];
  initialChats: Chat[];
  initialChatMembers: { chat_id: string; user_id: string }[];
  currentUserId: string;
  gameCode: string;
}) {
  const [chats, setChats] = useState(initialChats);
  const [chatMembers, setChatMembers] = useState(initialChatMembers);
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
      setChatMembers((old) => [
        ...old,
        { chat_id: result.id, user_id: currentUserId },
        { chat_id: result.id, user_id: player.id },
      ]);
      setSelectedChatId(result.id);
    } else setError(result.error ?? "Could not open private chat.");
    setBusyPlayerId("");
  }

  function hasPrivateChat(playerId: string) {
    return chats.some(
      (chat) =>
        chat.chat_type === "private" &&
        chatMembers.some(
          (member) =>
            member.chat_id === chat.id && member.user_id === playerId,
        ) &&
        chatMembers.some(
          (member) =>
            member.chat_id === chat.id && member.user_id === currentUserId,
        ),
    );
  }

  function isPrivateChatSelected(playerId: string) {
    const selectedMembers = chatMembers.filter(
      (member) => member.chat_id === selectedChat?.id,
    );
    return (
      selectedChat?.chat_type === "private" &&
      selectedMembers.some((member) => member.user_id === currentUserId) &&
      selectedMembers.some((member) => member.user_id === playerId)
    );
  }

  const publicChat = chats.find((chat) => chat.chat_type === "public");

  return (
    <section className="mt-10">
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="flex gap-2 overflow-x-auto">
            {!chats.length && (
              <p className="text-sm text-[var(--muted)]">
                The game master has not opened a public chat yet.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-rose-300">
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
            <UserRound size={20} /> Players
          </div>
          <div className="space-y-2">
            {publicChat && (
              <div
                onClick={() => setSelectedChatId(publicChat.id)}
                className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left ${selectedChatId === publicChat.id ? "border-[var(--accent)] bg-[#2a0a0a]" : "border-transparent hover:border-[var(--line)]"}`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[#050505]">
                  <MessageCircle size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    Public game chat
                  </span>
                  <span className="block text-xs text-[var(--muted)]">
                    {publicChat.status === "open" ? "Open" : "Closed"}
                  </span>
                </span>
              </div>
            )}
            {players
              .filter((player) => player.id !== currentUserId)
              .map((player) => (
                <div
                  key={player.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPrivateChat(player)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPrivateChat(player);
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border border-transparent p-2 hover:border-[var(--line)] hover:bg-[#2a0a0a] ${
                    busyPlayerId === player.id ? "pointer-events-none opacity-50" : ""
                  } ${
                    isPrivateChatSelected(player.id)
                      ? "border-[var(--accent)] bg-[#2a0a0a]"
                      : ""
                  }`}
                >
                  <Avatar profile={player} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {player.display_name || "Unnamed player"}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--accent)]">
                    {busyPlayerId === player.id
                      ? "Opening..."
                      : hasPrivateChat(player.id)
                        ? "Open chat"
                        : "Create chat"}
                  </span>
                </div>
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
