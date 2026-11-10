import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createGameSchema } from "@/lib/validations";

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

  const parsed = createGameSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid game settings." }, { status: 400 });

  const gameCode = parsed.data.game_code.toUpperCase();
  const { data: existingGame, error: lookupError } = await supabase
    .from("games")
    .select("game_code")
    .ilike("game_code", gameCode)
    .maybeSingle();
  if (lookupError)
    return NextResponse.json(
      { error: "Could not check game code." },
      { status: 500 },
    );
  if (existingGame)
    return NextResponse.json(
      { error: "That game code already exists." },
      { status: 409 },
    );

  const { data: game, error } = await supabase.rpc(
    "create_game_with_public_chat",
    {
      p_game_code: gameCode,
      p_has_decoy: parsed.data.has_decoy,
      p_correct_score: parsed.data.correct_score,
      p_exist_score: parsed.data.exist_score,
      p_allow_private_chats: parsed.data.allow_private_chats,
      p_decoy_score: parsed.data.decoy_score,
    },
  );
  if (!error && game) return NextResponse.json(game, { status: 201 });
  if (error) {
    console.error("Could not create game.", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
  if (error?.code === "42703" || error?.code === "42883")
    return NextResponse.json(
      { error: "The database is missing the latest game settings columns. Apply the current Supabase migrations." },
      { status: 500 },
    );
  if (error?.code === "42501")
    return NextResponse.json(
      { error: "You are not allowed to create a game with the current database policies." },
      { status: 403 },
    );
  if (error?.code !== "23505")
    return NextResponse.json({ error: "Could not create game." }, { status: 500 });

  return NextResponse.json(
    { error: "Could not generate a unique game code." },
    { status: 503 },
  );
}
