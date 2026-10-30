import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RoomClient } from "@/components/room-client";
import type { Message, Participant, Room } from "@/types/database";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const { data: room } = await supabase
    .from("rooms")
    .select("*, host:profiles!rooms_created_by_fkey(username,display_name)")
    .eq("id", id)
    .single();
  if (!room)
    return (
      <main className="mx-auto flex-1 px-5 py-12">
        <h1 className="text-2xl font-bold">Room not found</h1>
      </main>
    );
  const { data: membership } = await supabase
    .from("room_members")
    .select("user_id")
    .eq("room_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: messages } = membership
    ? await supabase
        .from("messages")
        .select(
          "*, sender:profiles!messages_sender_id_fkey(username,display_name)",
        )
        .eq("room_id", id)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };
  const { data: participants } = await supabase
    .from("room_members")
    .select("user_id,joined_at,profile:profiles(username,display_name)")
    .eq("room_id", id);
  const normalizedParticipants: Participant[] = (participants ?? []).map(
    (participant) => ({
      ...participant,
      profile: Array.isArray(participant.profile)
        ? (participant.profile[0] ?? null)
        : participant.profile,
    }),
  );
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
      <RoomClient
        room={room as Room}
        initialMessages={(messages ?? []).reverse() as Message[]}
        participants={normalizedParticipants}
        currentUserId={user.id}
        initialMember={Boolean(membership)}
      />
    </main>
  );
}
