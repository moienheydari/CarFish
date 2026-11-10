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
          () => router.refresh(),
        ),
    [gameCode, router],
  );
  useRealtimeChannel(`game-phase-${gameCode}`, configure, (status) => {
    if (status === "SUBSCRIBED") router.refresh();
  });

  return children;
}
