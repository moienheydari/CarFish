"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { Profile, Vote } from "@/types/database";
import { createClient } from "@/lib/supabase/browser";

export function VotePanel({
  players,
  currentUserId,
  gameCode,
  isDecoy,
  initialVotes,
}: {
  players: Profile[];
  currentUserId: string;
  gameCode: string;
  isDecoy: boolean;
  initialVotes: Vote[];
}) {
  const targets = players.filter((player) => player.id !== currentUserId);
  const decoyVote = initialVotes.find(
    (vote) => vote.vote_kind === "decoy_favorite",
  );
  const [guesses, setGuesses] = useState<Record<string, string>>(
    Object.fromEntries(initialVotes.map((vote) => [vote.target_id, vote.guess])),
  );
  const [votes, setVotes] = useState(initialVotes);
  const [favoriteId, setFavoriteId] = useState(decoyVote?.target_id ?? "");
  const [error, setError] = useState("");
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;
    async function subscribe() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active || !session) return;
      await supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`game-votes-${gameCode}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "votes", filter: `game_code=eq.${gameCode}` },
          (payload) => {
            const incoming = payload.new as Vote;
            if (payload.eventType === "DELETE") {
              const deletedId = String(payload.old.id ?? "");
              setVotes((current) => current.filter((vote) => vote.id !== deletedId));
              return;
            }
            if (incoming.voter_id !== currentUserId) return;
            setVotes((current) => [
              ...current.filter((vote) => vote.id !== incoming.id),
              incoming,
            ]);
            if (incoming.vote_kind === "decoy_favorite")
              setFavoriteId(incoming.target_id);
            else
              setGuesses((current) => ({ ...current, [incoming.target_id]: incoming.guess }));
          },
        )
        .subscribe();
    }
    void subscribe();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [currentUserId, gameCode]);
  const lockedCount = useMemo(
    () => targets.filter((target) => votes.some((vote) => vote.target_id === target.id && vote.status !== "unlocked")).length,
    [targets, votes],
  );
  const favoriteLocked = Boolean(
    votes.find((vote) => vote.vote_kind === "decoy_favorite")?.status !== "unlocked" &&
    votes.find((vote) => vote.vote_kind === "decoy_favorite"),
  );

  async function lockGuess(targetId: string, voteKind: "guess" | "decoy_favorite" = "guess") {
    setError("");
    const response = await fetch(`/api/games/${gameCode}/votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_id: targetId,
        guess: voteKind === "decoy_favorite" ? "favorite" : guesses[targetId] ?? "",
        vote_kind: voteKind,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Could not lock this guess.");
      return;
    }
    setVotes((current) => [
      ...current.filter((vote) => vote.target_id !== targetId),
      {
        id: result.id ?? crypto.randomUUID(),
        game_code: gameCode,
        voter_id: currentUserId,
        target_id: targetId,
        guess: voteKind === "decoy_favorite" ? "favorite" : guesses[targetId],
        status: "pending",
        vote_kind: voteKind,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  }

  return (
    <section className="mx-auto mt-10 max-w-3xl rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <p className="text-sm text-[var(--accent)]">Vote phase</p>
      <h2 className="mt-1 text-2xl font-semibold">
        {isDecoy ? "Choose your favorite player" : "Who is each player?"}
      </h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {isDecoy
          ? "Choose one player and lock your favorite."
          : "Lock each guess separately. You can wait for the game master after all guesses are locked."}
      </p>
      <div className="mt-6 space-y-3">
        {isDecoy ? (
          <label className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3">
            <select
              value={favoriteId}
              disabled={favoriteLocked}
              onChange={(event) => setFavoriteId(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[#050505] px-3 py-2 text-sm"
            >
              <option value="">Choose a player</option>
              {targets.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.display_name || "Unnamed player"}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={favoriteLocked || !favoriteId}
              onClick={() => void lockGuess(favoriteId, "decoy_favorite")}
              className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[#050505] disabled:opacity-50"
            >
              {favoriteLocked ? "Locked" : "Lock in"}
            </button>
          </label>
        ) : (
          targets.map((player) => {
          const vote = votes.find((item) => item.target_id === player.id);
          const locked = vote && vote.status !== "unlocked";
          return (
            <label key={player.id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3">
              {player.profile_image_url ? (
                <Image src={player.profile_image_url} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#2a0a0a] text-sm font-semibold text-[var(--accent)]">
                  {(player.display_name || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="w-32 shrink-0 text-sm font-medium">{player.display_name || "Unnamed player"}</span>
              <input
                value={guesses[player.id] ?? ""}
                disabled={Boolean(locked)}
                onChange={(event) => setGuesses((current) => ({ ...current, [player.id]: event.target.value }))}
                placeholder="Your guess"
                className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[#050505] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-60"
              />
              <button
                type="button"
                disabled={Boolean(locked) || !guesses[player.id]?.trim()}
                onClick={() => void lockGuess(player.id)}
                className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[#050505] disabled:opacity-50"
              >
                {locked ? "Locked" : "Lock in"}
              </button>
            </label>
          );
          })
        )}
        {!targets.length && <p className="text-sm text-[var(--muted)]">No other players to vote for.</p>}
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
      {!isDecoy && targets.length > 0 && lockedCount === targets.length && (
        <p role="status" className="mt-5 rounded-xl border border-[var(--line)] p-3 text-sm text-[var(--accent)]">
          All guesses are locked. Please wait for the game master.
        </p>
      )}
      {isDecoy && favoriteLocked && (
        <p role="status" className="mt-5 rounded-xl border border-[var(--line)] p-3 text-sm text-[var(--accent)]">
          Your favorite is locked. Please wait for the game master.
        </p>
      )}
    </section>
  );
}
