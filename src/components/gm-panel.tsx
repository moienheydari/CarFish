"use client";

import { useState } from "react";
import { MessageCircle, Users } from "lucide-react";
import Image from "next/image";
import { DashboardChat } from "@/components/dashboard-chat";
import type { Chat, Profile } from "@/types/database";

export function GmPanel({
  players,
  chats,
  currentUserId,
}: {
  players: Profile[];
  chats: Chat[];
  currentUserId: string;
}) {
  const [selectedChatId, setSelectedChatId] = useState(
    chats.find((chat) => chat.chat_type === "public")?.id ?? chats[0]?.id ?? "",
  );
  const selectedChat = chats.find((chat) => chat.id === selectedChatId) ?? null;

  return (
    <section className="mt-10">
      <div className="mb-5">
        <p className="text-sm text-[var(--accent)]">Game master panel</p>
        <h2 className="mt-1 text-2xl font-semibold">Players and conversations</h2>
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
        <DashboardChat
          key={selectedChat?.id ?? "empty"}
          chat={selectedChat}
          currentUserId={currentUserId}
          canSend={false}
          canManage
        />
        <aside className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <MessageCircle size={16} /> All chats
          </div>
          <div className="space-y-2">
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => setSelectedChatId(chat.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${chat.id === selectedChatId ? "border-[var(--accent)] bg-[#2a0a0a]" : "border-transparent hover:border-[var(--line)]"}`}
              >
                <span className="block font-medium">{chat.name}</span>
                <span className="text-xs text-[var(--muted)]">
                  {chat.chat_type} · {chat.status}
                </span>
              </button>
            ))}
            {!chats.length && (
              <p className="text-sm text-[var(--muted)]">No chats yet.</p>
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
