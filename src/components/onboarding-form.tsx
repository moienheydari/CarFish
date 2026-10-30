"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function OnboardingForm({
  initialUsername,
}: {
  initialUsername: string;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error);
    else router.push("/dashboard");
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <label className="block text-sm font-medium">
        Username
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={3}
          maxLength={20}
          required
          pattern="[A-Za-z0-9_]+"
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#07111f] px-4 py-3 outline-none focus:border-[var(--accent)]"
          placeholder="your_handle"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[#07111f] disabled:opacity-50"
      >
        {busy ? "Saving..." : "Continue"}
      </button>
    </form>
  );
}
