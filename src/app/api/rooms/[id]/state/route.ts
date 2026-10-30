import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
  if (status !== "active" && status !== "finished")
    return NextResponse.json(
      { error: "Invalid state transition." },
      { status: 400 },
    );
  const { id } = await params;
  const expected = status === "active" ? "waiting" : "active";
  const { data, error } = await supabase
    .from("rooms")
    .update({ status })
    .eq("id", id)
    .eq("created_by", user.id)
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
