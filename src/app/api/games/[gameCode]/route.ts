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

  const parsed = gamePhaseSchema.safeParse((await request.json()).phase);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid game phase." }, { status: 400 });

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

  const { data: game, error } = await supabase
    .from("games")
    .update({ phase: parsed.data })
    .eq("game_code", gameCode)
    .select("game_code,phase,has_decoy")
    .single();
  if (error || !game)
    return NextResponse.json(
      { error: "Could not update game phase." },
      { status: 500 },
    );
  return NextResponse.json(game);
}
