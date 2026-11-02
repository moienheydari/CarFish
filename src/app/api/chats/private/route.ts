import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { privateChatSchema } from "@/lib/validations";


export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const parsed = privateChatSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid private chat." },
      { status: 400 },
    );

  const gameCode = parsed.data.game_code.toUpperCase();
  const { data: participants } = await supabase
    .from("profiles")
    .select("id,game_code,is_gm")
    .in("id", [user.id, parsed.data.recipient_id]);
  const currentProfile = participants?.find((profile) => profile.id === user.id);
  const recipientProfile = participants?.find(
    (profile) => profile.id === parsed.data.recipient_id,
  );
  if (
    !currentProfile ||
    !recipientProfile ||
    currentProfile.game_code !== gameCode ||
    recipientProfile.game_code !== gameCode ||
    recipientProfile.is_gm
  )
    return NextResponse.json(
      { error: "Private chats are limited to players in your game." },
      { status: 403 },
    );

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({
      game_code: gameCode,
      name: `Private chat with ${parsed.data.recipient_id.slice(0, 8)}`,
      description: "A private player conversation.",
      chat_type: "private",
      created_by: user.id,
    })
    .select()
    .single();
  if (error || !chat)
    return NextResponse.json(
      { error: "Could not create private chat." },
      { status: 500 },
    );

  const { error: memberError } = await supabase.from("chat_members").insert([
    { chat_id: chat.id, user_id: user.id },
    { chat_id: chat.id, user_id: parsed.data.recipient_id },
  ]);
  if (memberError)
    return NextResponse.json(
      { error: "Private chat could not be opened." },
      { status: 500 },
    );
  return NextResponse.json(chat, { status: 201 });
}
