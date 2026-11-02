"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ChatForm() {
  const [values, setValues] = useState({
    game_code: "",
    name: "",
    description: "",
    chat_type: "public" as "public" | "private",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/chats", {
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
    router.push(`/chats/${result.id}`);
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium">
        Game code
        <input
          value={values.game_code}
          onChange={(e) =>
            setValues({ ...values, game_code: e.target.value.toUpperCase() })
          }
          minLength={4}
          maxLength={4}
          required
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 uppercase outline-none focus:border-[var(--accent)]"
          placeholder="ABCDE"
        />
      </label>
      <label className="block text-sm font-medium">
        Chat name
        <input
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          minLength={3}
          maxLength={60}
          required
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 outline-none focus:border-[var(--accent)]"
          placeholder="Friday Night Ideas"
        />
      </label>
      <label className="block text-sm font-medium">
        Chat type
        <select
          value={values.chat_type}
          onChange={(e) =>
            setValues({
              ...values,
              chat_type: e.target.value as "public" | "private",
            })
          }
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 outline-none focus:border-[var(--accent)]"
        >
          <option value="public">Public - everyone in the game</option>
          <option value="private">Private - two players</option>
        </select>
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
          className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 outline-none focus:border-[var(--accent)]"
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
        className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[#050505] disabled:opacity-50"
      >
        {busy ? "Creating..." : "Create chat"}
      </button>
    </form>
  );
}
