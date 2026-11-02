import { requireUser } from "@/lib/auth";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ChatClient } from "@/components/chat-client";
import type { Chat, Message, Participant } from "@/types/database";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const { data: room } = await supabase
    .from("chats")
    .select("*, host:profiles!chats_created_by_fkey(display_name)")
    .eq("id", id)
    .single();
  if (!room)
    return (
      <main className="mx-auto flex-1 px-5 py-12">
        <h1 className="text-2xl font-bold">Chat not found</h1>
      </main>
    );
  const { data: membership } = await supabase
    .from("chat_members")
    .select("user_id")
    .eq("chat_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: messages } = membership
    ? await supabase
        .from("messages")
        .select(
          "*, sender:profiles!messages_sender_id_fkey(display_name)",
        )
        .eq("chat_id", id)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };
  const { data: participants } = await supabase
    .from("chat_members")
    .select("user_id,joined_at,profile:profiles(display_name,profile_image_url)")
    .eq("chat_id", id);
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
      <ChatClient
        room={room as Chat}
        initialMessages={(messages ?? []).reverse() as Message[]}
        participants={normalizedParticipants}
        currentUserId={user.id}
        initialMember={Boolean(membership)}
      />
    </main>
  );
}
