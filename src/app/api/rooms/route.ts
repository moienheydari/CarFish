import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { roomSchema } from "@/lib/validations";

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
    .from("rooms")
    .select(
      "*, host:profiles!rooms_created_by_fkey(username,display_name), room_members(count)",
    )
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json(
      { error: "Unable to load rooms." },
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
  const parsed = roomSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid room." },
      { status: 400 },
    );
  const { data: room, error } = await supabase
    .from("rooms")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      created_by: user.id,
    })
    .select()
    .single();
  if (error || !room)
    return NextResponse.json(
      { error: "Could not create room." },
      { status: 500 },
    );
  const { error: memberError } = await supabase
    .from("room_members")
    .insert({ room_id: room.id, user_id: user.id });
  if (memberError)
    return NextResponse.json(
      { error: "Room created but membership could not be initialized." },
      { status: 500 },
    );
  return NextResponse.json(room, { status: 201 });
}
