import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatSchema } from "@/lib/validations";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const { data, error } = await supabase
    .from("chats")
    .select(
      "*, host:profiles!chats_created_by_fkey(display_name), chat_members(count)",
    )
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json(
      { error: "Unable to load chats." },
      { status: 500 },
    );
  return NextResponse.json(data);
}

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
  const parsed = chatSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid chat." },
      { status: 400 },
    );
  const { data: chat, error } = await supabase
    .from("chats")
    .insert({
      game_code: parsed.data.game_code.toUpperCase(),
      name: parsed.data.name,
      description: parsed.data.description || null,
      chat_type: parsed.data.chat_type,
      created_by: user.id,
    })
    .select()
    .single();
  if (error || !chat)
    return NextResponse.json(
      { error: "Could not create chat." },
      { status: 500 },
    );
  const { error: memberError } = await supabase
    .from("chat_members")
    .insert({ chat_id: chat.id, user_id: user.id });
  if (memberError)
    return NextResponse.json(
      { error: "Chat created but membership could not be initialized." },
      { status: 500 },
    );
  return NextResponse.json(chat, { status: 201 });
}
