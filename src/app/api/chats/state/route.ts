import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const body = await request.json();
  const { game_code: gameCode, status } = body;
  if (
    typeof gameCode !== "string" ||
    (status !== "open" && status !== "locked")
  )
    return NextResponse.json(
      { error: "Invalid game chat status." },
      { status: 400 },
    );

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_gm,game_code")
    .eq("id", user.id)
    .single();
  if (!profile?.is_gm || profile.game_code !== gameCode)
    return NextResponse.json(
      { error: "Only the game master can change game chat states." },
      { status: 403 },
    );

  const { data, error } = await supabase
    .from("chats")
    .update({ status })
    .eq("game_code", gameCode)
    .in("chat_type", ["public", "private"])
    .select();
  if (error)
    return NextResponse.json(
      { error: "Could not update game chat states." },
      { status: 500 },
    );

  return NextResponse.json(data);
}
