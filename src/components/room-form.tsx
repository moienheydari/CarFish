"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function RoomForm() {
  const [values, setValues] = useState({ name: "", description: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/rooms/${result.id}`);
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium">
        Room name
        <input
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          minLength={3}
          maxLength={60}
          required
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#07111f] px-4 py-3 outline-none focus:border-[var(--accent)]"
          placeholder="Friday Night Ideas"
        />
      </label>
      <label className="block text-sm font-medium">
        Description{" "}
        <span className="font-normal text-[var(--muted)]">(optional)</span>
        <textarea
          value={values.description}
          onChange={(e) =>
            setValues({ ...values, description: e.target.value })
          }
          maxLength={280}
          rows={4}
          className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-[#07111f] px-4 py-3 outline-none focus:border-[var(--accent)]"
          placeholder="What are we here to explore?"
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
        {busy ? "Creating..." : "Create room"}
      </button>
    </form>
  );
}
