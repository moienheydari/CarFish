"use client";

import Image from "next/image";
import type { Profile } from "@/types/database";

export function FinalPanel({
  players,
}: {
  players: Profile[];
}) {
  const results = [...players].sort(
    (left, right) => right.score - left.score || left.display_name?.localeCompare(right.display_name ?? "") || 0,
  );

  return (
    <section className="mx-auto mt-0 w-full">
      <div className="mb-4 text-center">
        <h2 className="mt-0 text-4xl font-semibold">The game is complete</h2>
      </div>
      <div className="mx-75 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
        {results.map((player, index) => (
          <div
            key={player.id}
            className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] p-2 last:border-b-0"
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
