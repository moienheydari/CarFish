"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function LoginButton({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    setBusy(true);
    setError("");
    const next = (await searchParams).next;
    const origin = window.location.origin;
    const { error: authError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next?.startsWith("/") ? next : "/dashboard")}`,
      },
    });
    if (authError) {
      setError(authError.message);
      setBusy(false);
    }
  }
  return (
    <div className="mt-8">
      <button
        onClick={login}
        disabled={busy}
        className="w-full rounded-xl bg-white px-5 py-3 font-semibold text-[#07111f] transition hover:bg-[var(--accent)] disabled:opacity-50"
      >
        {busy ? "Connecting..." : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
