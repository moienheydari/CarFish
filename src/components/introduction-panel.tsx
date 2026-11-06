"use client";

import { useState } from "react";
import Image from "next/image";
import type { Profile } from "@/types/database";

export function IntroductionPanel({ players }: { players: Profile[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const player = players[selectedIndex] ?? null;

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
      <p className="text-sm text-[var(--accent)]">Meet the players</p>
      <div className="mt-5 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Previous player"
          className="rounded-full border border-[var(--line)] px-4 py-2 text-xl"
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
              className="mx-auto h-32 w-32 rounded-full object-cover"
            />
          ) : (
            <div className="mx-auto grid h-32 w-32 place-items-center rounded-full bg-[#2a0a0a] text-4xl font-semibold text-[var(--accent)]">
              {(player.display_name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <h2 className="mt-4 text-2xl font-semibold">
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
          className="rounded-full border border-[var(--line)] px-4 py-2 text-xl"
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
