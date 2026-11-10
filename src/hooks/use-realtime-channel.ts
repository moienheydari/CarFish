"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type ChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

export function useRealtimeChannel(
  name: string,
  configure: (channel: RealtimeChannel) => RealtimeChannel,
  onStatus?: (status: ChannelStatus) => void,
) {
  const configureRef = useRef(configure);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    configureRef.current = configure;
    onStatusRef.current = onStatus;
  }, [configure, onStatus]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let channel: RealtimeChannel | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let connecting = false;

    function scheduleReconnect() {
      if (!active || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        void subscribe();
      }, 1000);
    }

    async function subscribe() {
      if (!active || connecting || channel) return;
      connecting = true;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) {
        connecting = false;
        return;
      }

      await supabase.realtime.setAuth(session.access_token);
      if (!active) return;
      const nextChannel = supabase.channel(`${name}-${crypto.randomUUID()}`);
      channel = configureRef.current(nextChannel);
      channel.subscribe((status) => {
        if (!active) return;
        connecting = false;
        onStatusRef.current?.(status as ChannelStatus);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          const failedChannel = channel;
          channel = null;
          if (failedChannel) void supabase.removeChannel(failedChannel);
          scheduleReconnect();
        }
      });
    }

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session) {
        void supabase.realtime.setAuth(session.access_token);
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") void subscribe();
      }
    });

    void subscribe();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      authSubscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [name]);
}

export type { RealtimePostgresChangesPayload };
