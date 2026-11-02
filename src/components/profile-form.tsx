"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/types/database";

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [values, setValues] = useState({
    username: profile?.username ?? "",
    display_name: profile?.display_name ?? "",
    profile_image_url: profile?.profile_image_url ?? "",
    bio: profile?.bio ?? "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error);
    else {
      setMessage("Profile saved successfully!");
      await new Promise((resolve) => setTimeout(resolve, 750));
      router.push("/dashboard");
    }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium">
        Username
        <input
          value={values.username}
          onChange={(e) => setValues({ ...values, username: e.target.value })}
          required
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 outline-none focus:border-[var(--accent)]"
        />
      </label>
      <label className="block text-sm font-medium">
        Display name
        <input
          value={values.display_name}
          onChange={(e) =>
            setValues({ ...values, display_name: e.target.value })
          }
          maxLength={50}
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 outline-none focus:border-[var(--accent)]"
        />
      </label>
      <label className="block text-sm font-medium">
        Profile image URL
        <input
          type="url"
          value={values.profile_image_url}
          onChange={(e) =>
            setValues({ ...values, profile_image_url: e.target.value })
          }
          maxLength={2048}
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 outline-none focus:border-[var(--accent)]"
          placeholder="https://example.com/avatar.png"
        />
      </label>
      <label className="block text-sm font-medium">
        Bio
        <textarea
          value={values.bio}
          onChange={(e) => setValues({ ...values, bio: e.target.value })}
          maxLength={280}
          rows={4}
          className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 outline-none focus:border-[var(--accent)]"
        />
      </label>
      <div className="flex items-center gap-4">
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-[var(--accent)]">
            {message}
          </p>
        )}
        <button
          disabled={busy}
          className="ml-auto rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[#050505] disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save profile"}
        </button>
      </div>
    </form>
  );
}
