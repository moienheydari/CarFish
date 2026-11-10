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
  const searchParams = new URL(request.url).searchParams;
  const beforeCreatedAt = searchParams.get("before_created_at");
  const beforeId = searchParams.get("before_id");
  let query = supabase
    .from("messages")
    .select("*, sender:profiles!messages_sender_id_fkey(display_name,profile_image_url)")
    .eq("chat_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(51);
  if (beforeCreatedAt && beforeId) {
    query = query.or(
      `created_at.lt.${beforeCreatedAt},and(created_at.eq.${beforeCreatedAt},id.lt.${beforeId})`,
    );
  }
  const { data, error } = await query;
  if (error)
    return NextResponse.json(
      { error: "Unable to load messages." },
      { status: 403 },
    );
  const rows = data ?? [];
  return NextResponse.json({
    messages: rows.slice(0, 50).reverse(),
    has_more: rows.length > 50,
  });
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
    .insert({
      chat_id: id,
      sender_id: user.id,
      content: parsed.data.content,
    })
    .select("*, sender:profiles!messages_sender_id_fkey(display_name,profile_image_url)")
    .single();
  if (error) {
    console.error("Could not send chat message.", {
      chatId: id,
      userId: user.id,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "You must join this chat before sending messages." },
      { status: 403 },
    );
  }
  return NextResponse.json(data, { status: 201 });
}
