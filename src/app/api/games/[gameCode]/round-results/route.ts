import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ gameCode: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const gameCode = (await params).gameCode.toUpperCase();
  const { data, error } = await supabase.rpc("send_round_results", {
    p_game_code: gameCode,
  });
  if (error) {
    console.error("Round result message failed:", error.code, error.message);
    return NextResponse.json({ error: "Could not send round results." }, { status: 500 });
  }

  return NextResponse.json({ sent: data === true });
}
