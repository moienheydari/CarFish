import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lockVoteSchema, reviewVoteSchema } from "@/lib/validations";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = lockVoteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid vote." }, { status: 400 });
  const gameCode = (await params).gameCode.toUpperCase();
  const { data: voterProfile } = await supabase
    .from("profiles")
    .select("game_code,is_gm,is_decoy")
    .eq("id", user.id)
    .single();
  if (!voterProfile || voterProfile.game_code !== gameCode || voterProfile.is_gm)
    return NextResponse.json({ error: "You cannot vote in this game." }, { status: 403 });
  if (parsed.data.vote_kind === "decoy_favorite" && !voterProfile.is_decoy)
    return NextResponse.json({ error: "Only the decoy can choose a favorite." }, { status: 403 });
  const { data: round, error: roundError } = await supabase
    .from("rounds")
    .select("id")
    .eq("game_code", gameCode)
    .eq("status", "active")
    .single();
  if (roundError || !round)
    return NextResponse.json({ error: "No active round is available." }, { status: 409 });
  const voteKind = parsed.data.vote_kind;
  let existingVoteQuery = supabase
    .from("votes")
    .select("id,status")
    .eq("game_code", gameCode)
    .eq("round_id", round.id)
    .eq("voter_id", user.id)
    .eq("target_id", parsed.data.target_id)
    .maybeSingle();
  const { data: existingVote, error: existingVoteError } = await existingVoteQuery;
  if (existingVoteError) {
    console.error("Vote lookup failed:", existingVoteError.code, existingVoteError.message);
    return NextResponse.json({ error: "Could not lock this guess." }, { status: 400 });
  }
  if (existingVote?.status === "pending")
    return NextResponse.json({ error: "This guess is already locked." }, { status: 409 });

  const { data, error } = await supabase.from("votes").upsert({
      game_code: gameCode,
      round_id: round.id,
      voter_id: user.id,
      target_id: parsed.data.target_id,
      guess: voteKind === "decoy_favorite" ? "favorite" : parsed.data.guess,
      vote_kind: voteKind,
      status: "pending",
    }, { onConflict: "game_code,voter_id,target_id,round_id" }).select("id").single();
  if (error) {
    console.error("Vote lock failed:", error.code, error.message);
    return NextResponse.json({ error: "Could not lock this guess." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = reviewVoteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid vote review." }, { status: 400 });
  const gameCode = (await params).gameCode.toUpperCase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_gm,game_code")
    .eq("id", user.id)
    .single();
  if (!profile?.is_gm || profile.game_code !== gameCode)
    return NextResponse.json({ error: "Only the game master can review votes." }, { status: 403 });

  const { data: activeRound, error: activeRoundError } = await supabase
    .from("rounds")
    .select("id")
    .eq("game_code", gameCode)
    .eq("status", "active")
    .maybeSingle();
  if (activeRoundError || !activeRound)
    return NextResponse.json({ error: "No active round is available." }, { status: 409 });

  const { error } = await supabase
    .from("votes")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.vote_id)
    .eq("game_code", gameCode)
    .eq("round_id", activeRound.id);
  if (error) {
    console.error("Vote review failed:", error.code, error.message);
    return NextResponse.json({ error: "Could not update this vote." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
