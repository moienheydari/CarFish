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

  const { data: participants } = await supabase
    .from("profiles")
    .select("id,game_code,is_gm,display_name")
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
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("allow_private_chats")
    .eq("game_code", gameCode)
    .single();
  if (gameError)
    return NextResponse.json({ error: "Could not check private chat settings." }, { status: 500 });
  if (!game.allow_private_chats)
    return NextResponse.json({ error: "Private chats are currently disabled by the game master." }, { status: 403 });

  const { data: sharedMemberships } = await supabase
    .from("chat_members")
    .select("chat_id,user_id")
    .in("user_id", [user.id, parsed.data.recipient_id]);
  const sharedChatIds = [
    ...new Set((sharedMemberships ?? []).map((membership) => membership.chat_id)),
  ].filter(
    (chatId) =>
      new Set(
        (sharedMemberships ?? [])
          .filter((membership) => membership.chat_id === chatId)
          .map((membership) => membership.user_id),
      ).size === 2,
  );
  if (sharedChatIds.length) {
    const { data: existingChat } = await supabase
      .from("chats")
      .select("*")
      .in("id", sharedChatIds)
      .eq("chat_type", "private")
      .eq("game_code", gameCode)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingChat) return NextResponse.json(existingChat);
  }

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({
      game_code: gameCode,
      name: `${(currentProfile.display_name || "Unnamed player").slice(0, 28)} & ${(recipientProfile.display_name || "Unnamed player").slice(0, 28)}`,
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
