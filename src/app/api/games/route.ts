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

  const { data: game, error } = await supabase
    .from("games")
    .insert({ game_code: gameCode, has_decoy: parsed.data.has_decoy })
    .select("game_code,phase,has_decoy")
    .maybeSingle();
  if (!error && game) return NextResponse.json(game, { status: 201 });
  if (error?.code !== "23505")
    return NextResponse.json({ error: "Could not create game." }, { status: 500 });

  return NextResponse.json(
    { error: "Could not generate a unique game code." },
    { status: 503 },
  );
}
