"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    const { error } = await createClient().auth.signOut();
    if (!error) router.push("/");
    setBusy(false);
  }
  return (
    <button
      onClick={signOut}
      disabled={busy}
      className="transition hover:text-white disabled:opacity-50"
    >
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}
