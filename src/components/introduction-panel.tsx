"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import type { Profile } from "@/types/database";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import type { RealtimeChannel } from "@supabase/supabase-js";

function sortPlayers(players: Profile[]) {
  return [...players].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() -
      new Date(left.updated_at).getTime(),
  );
}

export function IntroductionPanel({
  players: initialPlayers,
  gameCode,
}: {
  players: Profile[];
  gameCode: string;
}) {
  const [players, setPlayers] = useState(() => sortPlayers(initialPlayers));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const player = players[selectedIndex] ?? null;

  const configure = useCallback(
    (channel: RealtimeChannel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `game_code=eq.${gameCode}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = String(payload.old.id ?? "");
            setPlayers((current) =>
              current.filter((currentPlayer) => currentPlayer.id !== deletedId),
            );
            return;
          }

          const incoming = payload.new as Profile;
          setPlayers((current) => {
            const next = current.filter(
              (currentPlayer) => currentPlayer.id !== incoming.id,
            );
            return incoming.is_gm ? next : sortPlayers([...next, incoming]);
          });
        },
      ),
    [gameCode],
  );
  useRealtimeChannel(`profiles-${gameCode}`, configure);

  if (!player)
    return (
      <section className="mt-10 rounded-2xl border border-dashed border-[var(--line)] p-8 text-center text-[var(--muted)]">
        No players have joined yet.
      </section>
    );

  function move(direction: -1 | 1) {
    setSelectedIndex((current) => (current + direction + players.length) % players.length);
  }

  return (
    <section className="mx-auto mt-10 max-w-2xl rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <p className="text-lg text-[var(--accent)]">Meet the players</p>
      <div className="mt-5 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Previous player"
          className="cursor-pointer rounded-full border border-[var(--line)] px-4 py-2 text-xl transition hover:border-[var(--accent)] hover:bg-[#2a0a0a]"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1 text-center">
          {player.profile_image_url ? (
            <Image
              src={player.profile_image_url}
              alt=""
              width={128}
              height={128}
              unoptimized
              className="mx-auto h-45 w-45 rounded-full object-cover"
            />
          ) : (
            <div className="mx-auto grid h-45 w-45 place-items-center rounded-full bg-[#2a0a0a] text-4xl font-semibold text-[var(--accent)]">
              {(player.display_name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <h2 className="mt-4 text-3xl font-semibold">
            {player.display_name || "Unnamed player"}
          </h2>
          <div className="mt-4 grid gap-3 text-left sm:grid-cols-2">
            <Info label="Age" value={player.age?.toString() || "Not provided"} />
            <Info label="Job" value={player.job || "Not provided"} />
            <p className="sm:col-span-2 text-sm text-[var(--muted)]">
              {player.bio || "No bio provided."}
            </p>
          </div>
          <p className="mt-5 text-xs text-[var(--muted)]">
            {selectedIndex + 1} of {players.length}
          </p>
        </div>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Next player"
          className="cursor-pointer rounded-full border border-[var(--line)] px-4 py-2 text-xl transition hover:border-[var(--accent)] hover:bg-[#2a0a0a]"
        >
          ›
        </button>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] p-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}
