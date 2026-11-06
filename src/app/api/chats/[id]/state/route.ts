import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabase
    .from("chats")
    .select("id,status")
    .eq("id", id)
    .single();
  if (error || !data)
    return NextResponse.json({ error: "Could not load chat status." }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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
  const { status } = await request.json();
  if (status !== "open" && status !== "locked")
    return NextResponse.json(
      { error: "Invalid chat status." },
      { status: 400 },
    );
  const { id } = await params;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_gm,game_code")
    .eq("id", user.id)
    .single();
  const { data: chat } = await supabase
    .from("chats")
    .select("created_by,game_code")
    .eq("id", id)
    .single();
  const canManage =
    chat &&
    profile &&
    (chat.created_by === user.id ||
      (profile.is_gm && profile.game_code === chat.game_code));
  if (!canManage)
    return NextResponse.json(
      { error: "Only the game master or chat owner can change chat state." },
      { status: 403 },
    );
  const expected = status === "open" ? "locked" : "open";
  const { data, error } = await supabase
    .from("chats")
    .update({ status })
    .eq("id", id)
    .eq("status", expected)
    .select()
    .maybeSingle();
  if (error || !data)
    return NextResponse.json(
      { error: "Only the host can make that valid transition." },
      { status: 403 },
    );
  return NextResponse.json(data);
}
