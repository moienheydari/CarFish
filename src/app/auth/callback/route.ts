import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      const destination = profile?.username
        ? next?.startsWith("/")
          ? next
          : "/dashboard"
        : "/profile";
      return NextResponse.redirect(new URL(destination, url.origin));
    }
  }
  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", url.origin),
  );
}
