"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Users } from "lucide-react";
import Image from "next/image";
import { ChatBox } from "@/components/chat-box";
import {
  markChatRead,
  useUnreadChatCounts,
} from "@/hooks/use-unread-chat-counts";
import type { Chat, GamePhase, Profile, Vote, VoteStatus } from "@/types/database";
import { createClient } from "@/lib/supabase/browser";

export function GmPanel({
  players,
  chats,
  currentUserId,
  gameCode,
  initialPhase,
  votes,
  initialAllowPrivateChats,
  mentionableProfiles,
}: {
  players: Profile[];
  chats: Chat[];
  currentUserId: string;
  gameCode: string;
  initialPhase: GamePhase;
  votes: Vote[];
  initialAllowPrivateChats: boolean;
  mentionableProfiles: Profile[];
}) {
  const [phase, setPhase] = useState(initialPhase);
  const [phaseError, setPhaseError] = useState("");
  const [phaseBusy, setPhaseBusy] = useState(false);
  const [chatStatusBusy, setChatStatusBusy] = useState(false);
  const [allowPrivateChats, setAllowPrivateChats] = useState(initialAllowPrivateChats);
  const [reviewError, setReviewError] = useState("");
  const [reviewedVotes, setReviewedVotes] = useState(votes);
  const [hiddenVoteIds, setHiddenVoteIds] = useState<Set<string>>(new Set());
  const [gameChatsState, setGameChatsState] = useState(chats);
  const [selectedChatId, setSelectedChatId] = useState(
    chats.find((chat) => chat.chat_type === "public")?.id ?? chats[0]?.id ?? "",
  );
  const selectedChat = gameChatsState.find((chat) => chat.id === selectedChatId) ?? null;
  const gameChats = gameChatsState.filter((chat) => chat.chat_type !== "with_gm");
  const gmChats = gameChatsState.filter((chat) => chat.chat_type === "with_gm");

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;

    async function subscribe() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active || !session) return;
      await supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`gm-chats-${gameCode}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chats",
            filter: `game_code=eq.${gameCode}`,
          },
          (payload) => {
            if (!active) return;
            if (payload.eventType === "DELETE") {
              const deletedId = String(payload.old.id ?? "");
              setGameChatsState((current) =>
                current.filter((chat) => chat.id !== deletedId),
              );
              return;
            }
            const incoming = payload.new as Chat;
            setGameChatsState((current) => [
              ...current.filter((chat) => chat.id !== incoming.id),
              incoming,
            ]);
          },
        )
        .subscribe();
    }

    void subscribe();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [gameCode]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;
    async function subscribe() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active || !session) return;
      await supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`gm-votes-${gameCode}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "votes", filter: `game_code=eq.${gameCode}` },
          (payload) => {
            if (payload.eventType === "DELETE") {
              const deletedId = String(payload.old.id ?? "");
              setReviewedVotes((current) => current.filter((vote) => vote.id !== deletedId));
              return;
            }
            const incoming = payload.new as Vote;
            setReviewedVotes((current) => [
              ...current.filter((vote) => vote.id !== incoming.id),
              incoming,
            ]);
          },
        )
        .subscribe();
    }
    void subscribe();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [gameCode]);
  const unreadCounts = useUnreadChatCounts(gameChatsState, currentUserId);
  const visibleVotes = reviewedVotes
    .filter((vote) => !hiddenVoteIds.has(vote.id))
    .sort((left, right) => {
      if (left.status === "pending" && right.status !== "pending") return -1;
      if (left.status !== "pending" && right.status === "pending") return 1;
      return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    });

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
    if (response.ok) {
      setPhase(result.phase as GamePhase);
    }
    else setPhaseError(result.error ?? "Could not update game phase.");
    setPhaseBusy(false);
  }

  async function togglePrivateChats() {
    const nextValue = !allowPrivateChats;
    setPhaseError("");
    const response = await fetch(`/api/games/${gameCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allow_private_chats: nextValue }),
    });
    const result = await response.json();
    if (!response.ok) {
      setPhaseError(result.error ?? "Could not update private chat settings.");
      return;
    }
    setAllowPrivateChats(nextValue);
  }

  const allGameChatsOpen =
    gameChats.length > 0 && gameChats.every((chat) => chat.status === "open");

  async function toggleAllGameChats() {
    const nextStatus = allGameChatsOpen ? "locked" : "open";
    setChatStatusBusy(true);
    setPhaseError("");
    const response = await fetch("/api/chats/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_code: gameCode, status: nextStatus }),
    });
    const result = await response.json();
    if (!response.ok) {
      setPhaseError(result.error ?? "Could not update game chat states.");
      setChatStatusBusy(false);
      return;
    }
    setGameChatsState((current) =>
      current.map((chat) =>
        chat.chat_type === "with_gm" ? chat : { ...chat, status: nextStatus },
      ),
    );
    if (nextStatus === "locked" && allowPrivateChats) {
      await togglePrivateChats();
    }
    setChatStatusBusy(false);
  }

  async function reviewVote(voteId: string, status: VoteStatus) {
    setReviewError("");
    const response = await fetch(`/api/games/${gameCode}/votes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote_id: voteId, status }),
    });
    if (!response.ok) {
      const result = await response.json();
      setReviewError(result.error ?? "Could not update vote.");
      return;
    }

    setReviewedVotes((current) =>
      current.map((vote) => vote.id === voteId ? { ...vote, status } : vote),
    );
    if (status === "unlocked") {
      setHiddenVoteIds((current) => new Set(current).add(voteId));
    }
  }

  function clearDisplayedVotes() {
    setHiddenVoteIds(new Set(reviewedVotes.map((vote) => vote.id)));
  }

  return (
    <section className="mt-10">
      <div className="mb-5">
        <p className="text-sm text-[var(--accent)]">Game master panel</p>
        <h2 className="mt-1 text-2xl font-semibold">Players and conversations</h2>
      </div>
      <div className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Vote review</h3>
          {visibleVotes.length > 0 && (
            <button
              type="button"
              onClick={clearDisplayedVotes}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold"
            >
              Clear displayed votes
            </button>
          )}
        </div>
        <div className="mt-3 max-h-[20rem] space-y-2 overflow-y-auto pr-1">
          {visibleVotes.map((vote) => {
            const voter = players.find((player) => player.id === vote.voter_id);
            const target = players.find((player) => player.id === vote.target_id);
            const isDecoyFavorite = vote.vote_kind === "decoy_favorite";
            return (
              <div key={vote.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-3 text-sm">
                <span className="font-medium">{voter?.display_name ?? "Unknown"}</span>
                <span className="font-medium">({voter?.real_name ?? "Unknown"})</span>
                <span className="text-[var(--muted)]">guessed</span>
                <span className="font-medium">{target?.display_name ?? "Unknown"}</span>
                <span className="font-medium">({target?.real_name ?? "Unknown"})</span>
                <span className="text-[var(--muted)]">as {vote.guess}</span>
                <span className="ml-auto rounded-full border border-[var(--line)] px-2 py-1 text-xs">
                  {vote.status}
                </span>
                <div className="flex gap-2">
                  {vote.status === "pending" && (
                    <>
                      <button type="button" onClick={() => void reviewVote(vote.id, "correct")} className="rounded-lg bg-emerald-700 px-2 py-1 text-xs">Correct</button>
                      {!isDecoyFavorite && (
                        <>
                          <button type="button" onClick={() => void reviewVote(vote.id, "exists")} className="rounded-lg bg-amber-700 px-2 py-1 text-xs">Exists</button>
                          <button type="button" onClick={() => void reviewVote(vote.id, "none")} className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs">None</button>
                        </>
                      )}
                    </>
                  )}
                  {vote.status !== "unlocked" && (
                    <button type="button" onClick={() => void reviewVote(vote.id, "unlocked")} className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs">Unlock</button>
                  )}
                </div>
              </div>
            );
          })}
          {!visibleVotes.length && <p className="text-sm text-[var(--muted)]">No guesses to review.</p>}
        </div>
        {reviewError && <p role="alert" className="mt-2 text-sm text-rose-300">{reviewError}</p>}
      </div>
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div>
          <h3 className="font-semibold">Private player chats</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Players can always see existing chats, but this controls whether they can create new ones.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void togglePrivateChats()}
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${allowPrivateChats ? "bg-emerald-700" : "border border-[var(--line)]"}`}
        >
          {allowPrivateChats ? "Enabled" : "Disabled"}
        </button>
      </div>
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div>
          <h3 className="font-semibold">Game chats</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Open or close all public and private chats. Player conversations with the GM are not affected.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggleAllGameChats()}
          disabled={chatStatusBusy || !gameChats.length}
          className="rounded-xl border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50"
        >
          {allGameChatsOpen ? "Close all chats" : "Open all chats"}
        </button>
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
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {player.display_name || "Unnamed player"}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">
                    Real name: {player.real_name || "Not provided"}
                  </span>
                  {player.is_decoy ? (
                    <span className="mt-1 block text-xs font-semibold text-[var(--accent)]">
                      Decoy
                    </span>
                  ) : (
                    <div className="mt-1 flex gap-3 text-xs">
                      <span>Total: {player.score}</span>
                      <span className="text-[var(--accent)]">
                        Current: {player.current_score}
                      </span>
                    </div>
                  )}
                </div>
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
          mentionableProfiles={mentionableProfiles}
          canSendWhenClosed
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
