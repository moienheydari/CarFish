import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gamePhaseSchema } from "@/lib/validations";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const body = await request.json();

  const { gameCode: rawGameCode } = await params;
  const gameCode = rawGameCode.toUpperCase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_gm,game_code")
    .eq("id", user.id)
    .single();
  if (!profile?.is_gm || profile.game_code !== gameCode)
    return NextResponse.json(
      { error: "Only the game master can change the game phase." },
      { status: 403 },
    );
  const { data: currentGame, error: currentGameError } = await supabase
    .from("games")
    .select("phase")
    .eq("game_code", gameCode)
    .single();
  if (currentGameError)
    return NextResponse.json({ error: "Could not load game phase." }, { status: 500 });
  const phase = body.phase ?? currentGame.phase;
  const parsed = gamePhaseSchema.safeParse(phase);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid game phase." }, { status: 400 }    );
  const phaseChanged = currentGame.phase !== parsed.data;

  const { data: game, error } = await supabase
    .rpc("change_game_phase", {
      p_game_code: gameCode,
      p_phase: parsed.data,
    })
    .single();
  if (error || !game)
    return NextResponse.json(
      { error: "Could not update game phase." },
      { status: 500 },
    );
  if (typeof body.allow_private_chats === "boolean") {
    const { error: settingsError } = await supabase
      .from("games")
      .update({ allow_private_chats: body.allow_private_chats })
      .eq("game_code", gameCode);
    if (settingsError)
      return NextResponse.json(
        { error: "Phase changed, but private chat settings could not be updated." },
        { status: 500 },
      );
  }

  if (!phaseChanged) return NextResponse.json(game);

  const { data: publicChats, error: publicChatsError } = await supabase
    .from("chats")
    .select("id")
    .eq("game_code", gameCode)
    .eq("chat_type", "public");
  if (publicChatsError)
    return NextResponse.json(
      { error: "Game phase changed, but public chat messages could not be cleared." },
      { status: 500 },
    );

  const publicChatIds = (publicChats ?? []).map((chat) => chat.id);
  if (publicChatIds.length) {
    const { error: deleteError } = await supabase
      .from("messages")
      .delete()
      .in("chat_id", publicChatIds);
    if (deleteError)
      return NextResponse.json(
        { error: "Game phase changed, but public chat messages could not be cleared." },
        { status: 500 },
      );
  }

  return NextResponse.json(game);
}
