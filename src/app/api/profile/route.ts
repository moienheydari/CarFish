import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gameCodeSchema, profileSchema } from "@/lib/validations";

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid profile." },
      { status: 400 },
    );
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...parsed.data }, { onConflict: "id" })
    .select()
    .single();
  if (error)
    return NextResponse.json(
      { error: "Could not save profile." },
      { status: 500 },
    );
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
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
  if (body.action === "join") {
    const parsed = gameCodeSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid game code." },
        { status: 400 },
      );
    const gameCode = parsed.data.game_code.toUpperCase();
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("game_code,has_decoy")
      .eq("game_code", gameCode)
      .maybeSingle();
    if (gameError)
      return NextResponse.json({ error: "Could not check game." }, { status: 500 });
    if (!game)
      return NextResponse.json({ error: "Game not found." }, { status: 404 });

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ game_code: game.game_code })
      .eq("id", user.id);
    if (updateError)
      return NextResponse.json({ error: "Could not join game." }, { status: 500 });

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("is_gm,is_decoy")
      .eq("game_code", game.game_code);
    if (profilesError)
      return NextResponse.json({ error: "Could not check game roles." }, { status: 500 });
    return NextResponse.json({
      game_code: game.game_code,
      can_claim_game_master: !profiles.some((profile) => profile.is_gm),
      can_claim_decoy:
        game.has_decoy && !profiles.some((profile) => profile.is_decoy),
    });
  }

  if (body.action !== "claim_game_master" && body.action !== "claim_decoy")
    return NextResponse.json({ error: "Invalid profile action." }, { status: 400 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("game_code")
    .eq("id", user.id)
    .single();
  if (profileError)
    return NextResponse.json({ error: "Could not load profile." }, { status: 500 });

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,is_gm,is_decoy")
    .eq("game_code", profile.game_code);
  if (profilesError)
    return NextResponse.json({ error: "Could not check game roles." }, { status: 500 });

  const field = body.action === "claim_game_master" ? "is_gm" : "is_decoy";
  if (profiles.some((otherProfile) => otherProfile[field] && otherProfile.id !== user.id))
    return NextResponse.json({ error: "That role is already taken." }, { status: 409 });

  if (field === "is_decoy") {
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("has_decoy")
      .eq("game_code", profile.game_code)
      .single();
    if (gameError || !game?.has_decoy)
      return NextResponse.json({ error: "This game does not have a decoy." }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ [field]: true })
    .eq("id", user.id);
  if (updateError)
    return NextResponse.json({ error: "Could not claim role." }, { status: 500 });
  return NextResponse.json({ [field]: true });
}
