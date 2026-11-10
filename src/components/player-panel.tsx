"use client";

import { useCallback, useState } from "react";
import { MessageCircle, UserRound } from "lucide-react";
import Image from "next/image";
import { ChatBox } from "@/components/chat-box";
import { ProfileButton } from "@/components/profile-modal";
import {
  useUnreadChatCounts,
  markChatRead,
} from "@/hooks/use-unread-chat-counts";
import type { Chat, Profile } from "@/types/database";
import { createClient } from "@/lib/supabase/browser";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import type { RealtimeChannel } from "@supabase/supabase-js";

export function PlayerPanel({
  players,
  initialChats,
  initialChatMembers,
  currentUserId,
  gameCode,
  allowPrivateChats: initialAllowPrivateChats,
  mentionableProfiles,
}: {
  players: Profile[];
  initialChats: Chat[];
  initialChatMembers: { chat_id: string; user_id: string }[];
  currentUserId: string;
  gameCode: string;
  allowPrivateChats: boolean;
  mentionableProfiles: Profile[];
}) {
  const [chats, setChats] = useState(initialChats);
  const [chatMembers, setChatMembers] = useState(initialChatMembers);
  const [allowPrivateChats, setAllowPrivateChats] = useState(initialAllowPrivateChats);
  const [selectedChatId, setSelectedChatId] = useState(
    initialChats.find((chat) => chat.chat_type === "public")?.id ??
    initialChats[0]?.id ??
    "",
  );
  const [error, setError] = useState("");
  const [busyPlayerId, setBusyPlayerId] = useState("");
  const selectedChat = chats.find((chat) => chat.id === selectedChatId) ?? null;
  const unreadCounts = useUnreadChatCounts(chats, currentUserId);

  const reconcileChats = useCallback(async () => {
    const supabase = createClient();
    const [{ data: memberships }, { data: publicChats }] = await Promise.all([
      supabase
        .from("chat_members")
        .select("chat_id,user_id")
        .eq("user_id", currentUserId),
      supabase
        .from("chats")
        .select("*")
        .eq("game_code", gameCode)
        .eq("chat_type", "public"),
    ]);
    const memberRows = memberships ?? [];
    const chatIds = memberRows.map((membership) => membership.chat_id);
    const { data: memberChats } = chatIds.length
      ? await supabase.from("chats").select("*").in("id", chatIds).eq("game_code", gameCode)
      : { data: [] };
    setChatMembers((current) => [
      ...current.filter((membership) => membership.user_id !== currentUserId),
      ...memberRows,
    ]);
    setChats([
      ...(publicChats ?? []),
      ...(memberChats ?? []).filter((chat) => chat.chat_type !== "public"),
    ] as Chat[]);
  }, [currentUserId, gameCode]);
  const configure = useCallback(
    (channel: RealtimeChannel) =>
      channel
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "games", filter: `game_code=eq.${gameCode}` },
          (payload) => {
            setAllowPrivateChats(Boolean(payload.new.allow_private_chats));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chats",
            filter: `game_code=eq.${gameCode}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") {
              const deletedId = String(payload.old.id ?? "");
              setChats((current) => current.filter((chat) => chat.id !== deletedId));
              return;
            }
            const incoming = payload.new as Chat;
            setChats((current) => [
              ...current.filter((chat) => chat.id !== incoming.id),
              incoming,
            ]);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "chat_members",
            filter: `user_id=eq.${currentUserId}`,
          },
          async (payload) => {
            const membership = payload.new as { chat_id: string; user_id: string };
            const { data: incoming } = await createClient()
              .from("chats")
              .select("*")
              .eq("id", membership.chat_id)
              .eq("game_code", gameCode)
              .maybeSingle();
            if (incoming) {
              setChats((current) => [
                ...current.filter((chat) => chat.id !== incoming.id),
                incoming as Chat,
              ]);
              setChatMembers((current) => [
                ...current.filter(
                  (member) =>
                    !(
                      member.chat_id === membership.chat_id &&
                      member.user_id === membership.user_id
                    ),
                ),
                membership,
              ]);
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "chat_members",
            filter: `user_id=eq.${currentUserId}`,
          },
          (payload) => {
            const membership = payload.old as { chat_id: string; user_id: string };
            setChatMembers((current) =>
              current.filter(
                (member) =>
                  !(
                    member.chat_id === membership.chat_id &&
                    member.user_id === membership.user_id
                  ),
              ),
            );
            setChats((current) =>
              current.filter((chat) => chat.id !== membership.chat_id),
            );
          },
        ),
    [currentUserId, gameCode],
  );
  useRealtimeChannel(`player-game-${gameCode}-${currentUserId}`, configure, (status) => {
    if (status === "SUBSCRIBED") void reconcileChats();
  });

  function selectChat(chatId: string) {
    markChatRead(currentUserId, chatId);
    setSelectedChatId(chatId);
  }

  async function openPrivateChat(player: Profile) {
    if (player.id === currentUserId) return;
    if (!allowPrivateChats) return;
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

  function getPrivateChat(playerId: string) {
    return chats.find(
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
          <ChatBox
            key={selectedChat?.id ?? "empty"}
            chat={selectedChat}
            currentUserId={currentUserId}
            canSend
            canManage={false}
            mentionableProfiles={mentionableProfiles}
          />
        </div>
        <aside className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <UserRound size={20} /> Players
          </div>
          <div className="space-y-2">
            {publicChat && (
              <div
                onClick={() => selectChat(publicChat.id)}
                className={`relative flex w-full cursor-pointer items-center gap-3 rounded-xl border p-2 pr-8 text-left ${selectedChatId === publicChat.id ? "border-[var(--accent)] bg-[#2a0a0a]" : "border-transparent hover:border-[var(--line)]"}`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[#050505]">
                  <MessageCircle size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    Public Chat
                  </span>
                  <span className="block text-xs text-[var(--muted)]">
                    {publicChat.status === "open" ? "Open" : "Closed"}
                  </span>
                  {unreadCounts[publicChat.id] > 0 && (
                    <UnreadBadge count={unreadCounts[publicChat.id]} />
                  )}
                </span>
              </div>
            )}
            {players
              .filter((player) => player.id !== currentUserId)
              .map((player) => {
                const privateChat = getPrivateChat(player.id);
                return (
                  <div
                    key={player.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (privateChat) selectChat(privateChat.id);
                      else if (allowPrivateChats) void openPrivateChat(player);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (allowPrivateChats) void openPrivateChat(player);
                      }
                    }}
                    className={`relative flex cursor-pointer items-center gap-3 rounded-xl border border-transparent p-2 pr-8 hover:border-[var(--line)] hover:bg-[#2a0a0a] ${busyPlayerId === player.id ? "pointer-events-none opacity-50" : ""
                      } ${isPrivateChatSelected(player.id)
                        ? "border-[var(--accent)] bg-[#2a0a0a]"
                        : ""
                      }`}
                  >
                    <ProfileButton profile={player} className="absolute left-1 top-1 z-10" />
                    <Avatar profile={player} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {player.display_name || "Unnamed player"}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--accent)]">
                      {busyPlayerId === player.id
                        ? "Opening..."
                        : hasPrivateChat(player.id)
                          ? "Open"
                          : allowPrivateChats ? "Create" : ""}
                    </span>
                    {privateChat && unreadCounts[privateChat.id] > 0 && (
                      <UnreadBadge count={unreadCounts[privateChat.id]} />
                    )}
                  </div>
                );
              })}
            {!players.length && (
              <p className="text-sm text-[var(--muted)]">No players yet.</p>
            )}
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
