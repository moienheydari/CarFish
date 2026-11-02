"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";

export function LoginButton({
  searchParams,
  mode,
  setMode,
}: {
  searchParams: Promise<{ next?: string }>;
  mode: "login" | "signup";
  setMode: (mode: "login" | "signup") => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { next } = await searchParams;
    const requestedDestination = next?.startsWith("/") ? next : "/dashboard";
    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
          email,
          password,
        });
    const authError = result.error;
    if (authError) {
      setError(authError.message);
      setBusy(false);
      return;
    }

    if (!result.data.user || !result.data.session) {
      setError("Account created, but no active session was returned. Try signing in.");
      setBusy(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        { id: result.data.user.id },
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (profileError) {
      setError(profileError.message);
      setBusy(false);
      return;
    }

    const { data: profile, error: profileReadError } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", result.data.user.id)
      .maybeSingle();
    if (profileReadError) {
      setError(profileReadError.message);
      setBusy(false);
      return;
    }

    router.push(profile?.display_name ? requestedDestination : "/profile");
  }

  async function loginWithGoogle() {
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
      <form onSubmit={submit} className="space-y-4 text-left">
        <label className="block text-sm font-medium">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 outline-none focus:border-[var(--accent)]"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className={`w-full rounded-xl px-5 py-3 font-semibold transition disabled:opacity-50 ${mode === "login"
            ? "bg-[var(--accent)] text-[#050505] hover:bg-white"
            : "bg-[#2f00ff] text-white hover:bg-white hover:text-[#050505]"
            }`}
        >
          {busy ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError("");
        }}
        disabled={busy}
        className={`mt-4 w-full rounded-xl border px-5 py-3 text-sm font-semibold transition disabled:opacity-50 ${mode === "login"
          ? "border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          : "border-[var(--line)] text-[var(--muted)] hover:border-[#2f00ff] hover:text-[#2f00ff]"
          }`}
      >
        {mode === "login"
          ? "Need an account? Create one"
          : "Already have an account? Sign in"}
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-[var(--muted)]">
        <span className="h-px flex-1 bg-[var(--line)]" />
        OR
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      <button
        type="button"
        onClick={loginWithGoogle}
        disabled={busy}
        className="w-full rounded-xl bg-white px-5 py-3 font-semibold text-[#050505] transition hover:bg-[var(--accent)] disabled:opacity-50"
      >
        Continue with Google
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
