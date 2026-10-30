import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function POST(
  _: Request,
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
  const { id } = await params;
  const { error } = await supabase
    .from("room_members")
    .insert({ room_id: id, user_id: user.id });
  if (error && error.code !== "23505")
    return NextResponse.json(
      { error: "Could not join this room." },
      { status: 400 },
    );
  return NextResponse.json({ ok: true });
}
