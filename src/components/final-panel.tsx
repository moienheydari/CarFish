"use client";

import Image from "next/image";
import type { Profile } from "@/types/database";

export function FinalPanel({
  players,
  correctGuessCounts,
}: {
  players: Profile[];
  correctGuessCounts: Record<string, number>;
}) {
  const results = [...players].sort(
    (left, right) => right.score - left.score || left.display_name?.localeCompare(right.display_name ?? "") || 0,
  );

  return (
    <section className="mx-auto mt-10 w-full">
      <div className="mb-6 text-center">
        <p className="text-sm text-[var(--accent)]">Final results</p>
        <h2 className="mt-1 text-3xl font-semibold">The game is complete</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Here are the final scores and the identities revealed.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
        {results.map((player, index) => (
          <div
            key={player.id}
            className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] p-4 last:border-b-0"
          >
            <span className="w-6 text-center text-lg font-semibold text-[var(--muted)]">
              {index + 1}
            </span>
            {player.profile_image_url ? (
              <Image
                src={player.profile_image_url}
                alt=""
                width={48}
                height={48}
                unoptimized
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#2a0a0a] text-lg font-semibold text-[var(--accent)]">
                {(player.display_name || "?").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {player.display_name || "Unnamed player"}
              </p>
              <p className="text-sm text-[var(--muted)]">
                Real name: {player.real_name || "Not provided"}
              </p>
              {player.is_decoy && (
                <p className="mt-1 text-sm font-semibold text-[var(--accent)]">
                  Decoy
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{player.score}</p>
              <p className="text-xs text-[var(--muted)]">final score</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Correctly guessed {correctGuessCounts[player.id] ?? 0}{" "}
                {correctGuessCounts[player.id] === 1 ? "time" : "times"}
              </p>
            </div>
          </div>
        ))}
        {!results.length && (
          <p className="p-6 text-center text-sm text-[var(--muted)]">
            No players yet.
          </p>
        )}
      </div>
    </section>
  );
}
