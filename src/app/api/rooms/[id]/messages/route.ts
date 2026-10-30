import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { messageSchema } from "@/lib/validations";
export async function GET(
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
  const { id } = await params;
  const before = new URL(request.url).searchParams.get("before");
  let query = supabase
    .from("messages")
    .select("*, sender:profiles!messages_sender_id_fkey(username,display_name)")
    .eq("room_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error)
    return NextResponse.json(
      { error: "Unable to load messages." },
      { status: 403 },
    );
  return NextResponse.json((data ?? []).reverse());
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
  const parsed = messageSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid message." },
      { status: 400 },
    );
  const { id } = await params;
  const { data, error } = await supabase
    .from("messages")
    .insert({ room_id: id, sender_id: user.id, content: parsed.data.content })
    .select("*, sender:profiles!messages_sender_id_fkey(username,display_name)")
    .single();
  if (error)
    return NextResponse.json(
      { error: "You must join this room before sending messages." },
      { status: 403 },
    );
  return NextResponse.json(data, { status: 201 });
}
