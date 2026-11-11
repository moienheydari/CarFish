"use client";

import { useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import type { RealtimeChannel } from "@supabase/supabase-js";

export function GamePhaseSync({
  gameCode,
  children,
}: {
  gameCode: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const configure = useCallback(
    (channel: RealtimeChannel) =>
      channel
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "games",
            filter: `game_code=eq.${gameCode}`,
          },
          (payload) => {
            router.refresh();
            if (payload.new.phase === "chat_phase" || payload.new.phase === "final") {
              window.setTimeout(() => {
                void fetch(`/api/games/${gameCode}/round-results`, { method: "POST" })
                  .then(async (response) => {
                    if (!response.ok) {
                      const result = await response.json() as { error?: string };
                      throw new Error(result.error ?? "Could not send round results.");
                    }
                  })
                  .catch((error: unknown) => {
                    console.error("Round result message failed:", error);
                  });
              }, 3000);
            }
          },
        ),
    [gameCode, router],
  );
  useRealtimeChannel(`game-phase-${gameCode}`, configure, (status) => {
    if (status === "SUBSCRIBED") router.refresh();
  });

  return children;
}
