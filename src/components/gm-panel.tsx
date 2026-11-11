"use client";

import { useCallback, useState } from "react";
import { MessageCircle, Users } from "lucide-react";
import Image from "next/image";
import { ChatBox } from "@/components/chat-box";
import {
  markChatRead,
  useUnreadChatCounts,
} from "@/hooks/use-unread-chat-counts";
import type { Chat, GamePhase, Profile, Round, Vote, VoteStatus } from "@/types/database";
import { createClient } from "@/lib/supabase/browser";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import type { RealtimeChannel } from "@supabase/supabase-js";

export function GmPanel({
  players,
  chats,
  currentUserId,
  gameCode,
  roundId,
  rounds,
  initialPhase,
  votes,
  initialAllowPrivateChats,
  mentionableProfiles,
}: {
  players: Profile[];
  chats: Chat[];
  currentUserId: string;
  gameCode: string;
  roundId: string;
  rounds: Round[];
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
  const [reviewingVoteIds, setReviewingVoteIds] = useState<Set<string>>(new Set());
  const [selectedRoundId, setSelectedRoundId] = useState(
    roundId || rounds[0]?.id || "",
  );
  const [hiddenVoteIds, setHiddenVoteIds] = useState<Set<string>>(new Set());
  const [gameChatsState, setGameChatsState] = useState(chats);
  const [selectedChatId, setSelectedChatId] = useState(
    chats.find((chat) => chat.chat_type === "public")?.id ?? chats[0]?.id ?? "",
  );
  const selectedChat = gameChatsState.find((chat) => chat.id === selectedChatId) ?? null;
  const gameChats = gameChatsState.filter((chat) => chat.chat_type !== "with_gm");
  const gmChats = gameChatsState.filter((chat) => chat.chat_type === "with_gm");

  const reconcileChats = useCallback(async () => {
    const { data } = await createClient()
      .from("chats")
      .select("*")
      .eq("game_code", gameCode);
    if (data) setGameChatsState(data as Chat[]);
  }, [gameCode]);
  const configureChats = useCallback(
    (channel: RealtimeChannel) =>
      channel.on(
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
      ),
    [gameCode],
  );
  useRealtimeChannel(`gm-chats-${gameCode}`, configureChats, (status) => {
    if (status === "SUBSCRIBED") void reconcileChats();
  });

  const reconcileVotes = useCallback(async () => {
    const { data } = await createClient()
      .from("votes")
      .select("*")
      .eq("game_code", gameCode);
    if (data) setReviewedVotes(data as Vote[]);
  }, [gameCode]);
  const configureVotes = useCallback(
    (channel: RealtimeChannel) =>
      channel.on(
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
      ),
    [gameCode],
  );
  useRealtimeChannel(`gm-votes-${gameCode}`, configureVotes, (status) => {
    if (status === "SUBSCRIBED") void reconcileVotes();
  });
  const unreadCounts = useUnreadChatCounts(gameChatsState, currentUserId);
  const sortedGameChats = [...gameChats].sort((left, right) => {
    const leftIsPublic = left.chat_type === "public";
    const rightIsPublic = right.chat_type === "public";
    if (leftIsPublic !== rightIsPublic) return leftIsPublic ? -1 : 1;
    return (unreadCounts[right.id] ?? 0) - (unreadCounts[left.id] ?? 0);
  });
  const sortedGmChats = [...gmChats].sort(
    (left, right) => (unreadCounts[right.id] ?? 0) - (unreadCounts[left.id] ?? 0),
  );
  const sortedRounds = [...rounds].sort((left, right) => right.round_number - left.round_number);
  const visibleVotes = reviewedVotes
    .filter((vote) => vote.round_id === selectedRoundId && !hiddenVoteIds.has(vote.id))
    .sort((left, right) => {
      if (left.status === "pending" && right.status !== "pending") return -1;
      if (left.status !== "pending" && right.status === "pending") return 1;
      return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    });

  function selectChat(chatId: string) {
    void markChatRead(chatId);
    setSelectedChatId(chatId);
  }

  async function changePhase(nextPhase: GamePhase) {
    setPhaseBusy(true);
    setPhaseError("");
    try {
      const response = await fetch(`/api/games/${gameCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: nextPhase }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update game phase.");
      setPhase(result.phase as GamePhase);
    } catch (caughtError) {
      setPhaseError(caughtError instanceof Error ? caughtError.message : "Could not update game phase.");
    } finally {
      setPhaseBusy(false);
    }
  }

  async function togglePrivateChats() {
    const nextValue = !allowPrivateChats;
    setPhaseError("");
    try {
      const response = await fetch(`/api/games/${gameCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allow_private_chats: nextValue }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update private chat settings.");
      setAllowPrivateChats(nextValue);
    } catch (caughtError) {
      setPhaseError(caughtError instanceof Error ? caughtError.message : "Could not update private chat settings.");
    }
  }

  const allGameChatsOpen =
    gameChats.length > 0 && gameChats.every((chat) => chat.status === "open");

  async function toggleAllGameChats() {
    const nextStatus = allGameChatsOpen ? "locked" : "open";
    setChatStatusBusy(true);
    setPhaseError("");
    try {
      const response = await fetch("/api/chats/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_code: gameCode, status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update game chat states.");
      setGameChatsState((current) =>
        current.map((chat) =>
          chat.chat_type === "with_gm" ? chat : { ...chat, status: nextStatus },
        ),
      );
      if (nextStatus === "locked" && allowPrivateChats) await togglePrivateChats();
    } catch (caughtError) {
      setPhaseError(caughtError instanceof Error ? caughtError.message : "Could not update game chat states.");
    } finally {
      setChatStatusBusy(false);
    }
  }

  async function reviewVote(voteId: string, status: VoteStatus) {
    setReviewError("");
    setReviewingVoteIds((current) => new Set(current).add(voteId));
    try {
      const response = await fetch(`/api/games/${gameCode}/votes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote_id: voteId, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update vote.");
      setReviewedVotes((current) =>
        current.map((vote) => vote.id === voteId ? { ...vote, status } : vote),
      );
    } catch (caughtError) {
      setReviewError(caughtError instanceof Error ? caughtError.message : "Could not update vote.");
    } finally {
      setReviewingVoteIds((current) => {
        const next = new Set(current);
        next.delete(voteId);
        return next;
      });
    }
  }

  function clearDisplayedVotes() {
    setHiddenVoteIds((current) => new Set([
      ...current,
      ...reviewedVotes
        .filter((vote) => vote.round_id === selectedRoundId)
        .map((vote) => vote.id),
    ]));
  }

  return (
    <section className="mt-1">
      <div className="mb-1 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
        <div className="flex items-center justify-between gap-1">
          <h3 className="font-semibold">Vote review</h3>
          {visibleVotes.length > 0 && (
            <button
              type="button"
              onClick={clearDisplayedVotes}
              className="cursor-pointer rounded-xl border border-[var(--line)] px-2.5 py-1.5 text-sm font-semibold transition hover:border-[var(--accent)] hover:bg-[#2a0a0a] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              Clear displayed votes
            </button>
          )}
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {sortedRounds.reverse().map((round) => (
            <button
              key={round.id}
              type="button"
              onClick={() => setSelectedRoundId(round.id)}
              aria-pressed={selectedRoundId === round.id}
              className={`shrink-0 cursor-pointer rounded-xl border px-2 py-1 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${selectedRoundId === round.id
                ? "border-[var(--accent)] bg-[#2a0a0a] text-white"
                : "border-[var(--line)] hover:border-[var(--accent)]"
                }`}
            >
              {round.round_number}
            </button>
          ))}
        </div>
        <div className="mt-2 max-h-[20rem] space-y-0.5 overflow-y-auto pr-1">
          {visibleVotes.map((vote) => {
            const voter = players.find((player) => player.id === vote.voter_id);
            const target = players.find((player) => player.id === vote.target_id);
            const isDecoyFavorite = vote.vote_kind === "decoy_favorite";
            const isReviewing = reviewingVoteIds.has(vote.id);
            return (
              <div key={vote.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] p-2 text-sm">
                <span className="font-medium">{voter?.display_name ?? "Unknown"}</span>
                <span className="font-medium">({voter?.real_name ?? "Unknown"})</span>
                <span className="text-[var(--muted)]">guessed</span>
                <span className="font-medium">{target?.display_name ?? "Unknown"}</span>
                <span className="font-medium">({target?.real_name ?? "Unknown"})</span>
                <span className="text-[var(--muted)]">as </span>
                <span className="font-medium">{vote.guess}</span>
                <span className="text-[var(--muted)] text-xs"> |  {new Date(vote.updated_at).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                </span>
                <span className="ml-auto rounded-full border border-[var(--line)] px-2 py-0.5 text-xs">
                  {vote.status}
                </span>
                <div className="flex gap-1">
                  {vote.status === "pending" && (
                    <>
                      <button type="button" disabled={isReviewing} onClick={() => void reviewVote(vote.id, "correct")} className="cursor-pointer rounded-lg bg-emerald-700 px-2 py-0.5 text-xs transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">{isReviewing ? "Verifying..." : "Correct"}</button>
                      {!isDecoyFavorite && (
                        <>
                          <button type="button" disabled={isReviewing} onClick={() => void reviewVote(vote.id, "exists")} className="cursor-pointer rounded-lg bg-amber-700 px-2 py-0.5 text-xs transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60">{isReviewing ? "Verifying..." : "Exists"}</button>
                          <button type="button" disabled={isReviewing} onClick={() => void reviewVote(vote.id, "none")} className="cursor-pointer rounded-lg border border-[var(--line)] px-2 py-0.5 text-xs transition hover:border-[var(--accent)] hover:bg-[#2a0a0a] disabled:cursor-not-allowed disabled:opacity-60">{isReviewing ? "Verifying..." : "None"}</button>
                        </>
                      )}
                    </>
                  )}
                  {vote.status !== "unlocked" && (
                    <button type="button" disabled={isReviewing} onClick={() => void reviewVote(vote.id, "unlocked")} className="cursor-pointer rounded-lg border border-[var(--line)] px-2 py-0.5 text-xs transition hover:border-[var(--accent)] hover:bg-[#2a0a0a] disabled:cursor-not-allowed disabled:opacity-60">{isReviewing ? "Verifying..." : "Unlock"}</button>
                  )}
                </div>
              </div>
            );
          })}
          {!visibleVotes.length && <p className="text-sm text-[var(--muted)]">No guesses to review.</p>}
        </div>
        {reviewError && <p role="alert" className="mt-2 text-sm text-rose-300">{reviewError}</p>}
      </div>
      <div className="mb-1 grid gap-1 lg:grid-cols-3">
        <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <h3 className="font-semibold">Private Chat Creation</h3>
          <button
            type="button"
            onClick={() => void togglePrivateChats()}
            className={`cursor-pointer rounded-xl px-2.5 py-1.5 text-sm font-semibold transition hover:brightness-110 ${allowPrivateChats ? "bg-emerald-700" : "border border-[var(--line)] hover:bg-[#2a0a0a]"}`}
          >
            {allowPrivateChats ? "Enabled" : "Disabled"}
          </button>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <h3 className="font-semibold">Chats</h3>
          <button
            type="button"
            onClick={() => void toggleAllGameChats()}
            disabled={chatStatusBusy || !gameChats.length}
            className="cursor-pointer rounded-xl border border-[var(--accent)] px-2.5 py-1.5 text-sm font-semibold text-[var(--accent)] transition hover:bg-[#2a0a0a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allGameChatsOpen ? "Close all chats" : "Open all chats"}
          </button>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <label className="flex items-center justify-between gap-3 text-m font-semibold">
            <span className="flex items-center gap-2">
              Game Phase
              {phaseBusy && (
                <span className="animate-pulse text-xs font-normal text-[var(--muted)]">
                  Changing...
                </span>
              )}
            </span>
            <select
              value={phase}
              onChange={(event) => void changePhase(event.target.value as GamePhase)}
              disabled={phaseBusy}
              className="rounded-lg border border-[var(--line)] bg-[#050505] px-2 py-1.5 text-sm font-normal outline-none focus:border-[var(--accent)] disabled:cursor-wait disabled:opacity-60"
            >
              <option value="not_started">Not started</option>
              <option value="chat_phase">Chat phase</option>
              <option value="vote_phase">Vote phase</option>
              <option value="final">Final</option>
            </select>
          </label>
          {phaseError && (
            <p role="alert" className="mt-2 text-sm text-rose-300">
              {phaseError}
            </p>
          )}
        </div>
      </div>
      <div className="grid gap-1 lg:grid-cols-[200px_1fr_280px_180px]">
        <aside className="flex h-[80vh] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="mb-2 flex shrink-0 items-center gap-2 text-sm font-semibold">
            <Users size={16} /> Players ({players.length})
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {players.map((player) => (
              <div key={player.id} className="flex items-center gap-2 rounded-xl p-1.5">
                <Avatar profile={player} />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {player.display_name || "Unnamed player"}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">
                    Real: {player.real_name || "Not provided"}
                  </span>
                  {player.is_decoy ? (
                    <span className="mt-0.5 block text-xs font-semibold text-[var(--accent)]">
                      Decoy
                    </span>
                  ) : (
                    <div className="mt-0.5 flex gap-2 text-xs">
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
        <aside className="flex h-[80vh] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="mb-2 flex shrink-0 items-center gap-2 text-sm font-semibold">
            <MessageCircle size={16} /> Game chats
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-1">
              {sortedGameChats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => selectChat(chat.id)}
                  className={`relative w-full rounded-xl border px-2.5 py-2 pr-8 text-left text-sm ${chat.id === selectedChatId ? "border-[var(--accent)] bg-[#2a0a0a]" : "border-transparent hover:border-[var(--line)]"}`}
                >
                  <span className="block text-sm">{chat.name}<span className="text-xs text-[var(--muted)]"> ({chat.status})</span></span>
                  {unreadCounts[chat.id] > 0 && (
                    <UnreadBadge count={unreadCounts[chat.id]} />
                  )}
                </button>
              ))}
              {!sortedGameChats.length && (
                <p className="text-sm text-[var(--muted)]">No chats yet.</p>
              )}
            </div>
          </div>
        </aside>
        <aside className="flex h-[80vh] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="mb-2 flex shrink-0 items-center gap-2 text-sm font-semibold">
            <MessageCircle size={16} /> GM chats
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-1">
              {sortedGmChats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => selectChat(chat.id)}
                  className={`relative w-full rounded-xl border px-2.5 py-2 pr-8 text-left text-sm ${chat.id === selectedChatId ? "border-[var(--accent)] bg-[#2a0a0a]" : "border-transparent hover:border-[var(--line)]"}`}
                >
                  <span className="block text-sm">{chat.name.replace(/\s*&\s*GM\s*$/, "")}</span>
                  {unreadCounts[chat.id] > 0 && (
                    <UnreadBadge count={unreadCounts[chat.id]} />
                  )}
                </button>
              ))}
              {!sortedGmChats.length && (
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
