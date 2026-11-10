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
  if (parsed.data.recipient_id === user.id)
    return NextResponse.json(
      { error: "You cannot create a private chat with yourself." },
      { status: 400 },
    );

  const { data: chat, error } = await supabase.rpc(
    "get_or_create_private_chat",
    {
      p_game_code: gameCode,
      p_recipient_id: parsed.data.recipient_id,
    },
  );
  const errorMessage = error?.message;
  if (
    errorMessage === "Private chats are limited to players in your game." ||
    errorMessage ===
      "Private chats are currently disabled by the game master."
  )
    return NextResponse.json({ error: errorMessage }, { status: 403 });
  if (error || !chat)
    return NextResponse.json(
      { error: "Could not create private chat." },
      { status: 500 },
    );
  return NextResponse.json(chat);
}
