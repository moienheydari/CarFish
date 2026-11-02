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
    .from("chat_members")
    .delete()
    .eq("chat_id", id)
    .eq("user_id", user.id);
  if (error)
    return NextResponse.json(
      { error: "Could not leave this chat." },
      { status: 400 },
    );
  return NextResponse.json({ ok: true });
}
