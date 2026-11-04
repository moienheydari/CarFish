"use client";

import { useState } from "react";

export function GameCreateModal({
  open,
  busy,
  gameCode,
  onClose,
  onBusyChange,
  onCreated,
}: {
  open: boolean;
  busy: boolean;
  gameCode: string;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onCreated: (gameCode: string) => void;
}) {
  const [hasDecoy, setHasDecoy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!open) return null;

  function closeModal() {
    if (busy) return;
    setError("");
    setSuccess("");
    setHasDecoy(false);
    onClose();
  }

  async function createGame() {
    onBusyChange(true);
    setError("");
    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_code: gameCode, has_decoy: hasDecoy }),
      });
      const responseText = await response.text();
      let result: { game_code?: string; error?: string } = {};
      if (responseText) {
        try {
          result = JSON.parse(responseText) as typeof result;
        } catch {
          throw new Error("The server returned an invalid response.");
        }
      }
      if (!response.ok) throw new Error(result.error ?? "Could not create game.");
      if (!result.game_code) throw new Error("The server did not return a game code.");
      onCreated(result.game_code);
      setSuccess(`Game ${result.game_code} created successfully.`);
      window.setTimeout(() => {
        onClose();
        setSuccess("");
        setHasDecoy(false);
      }, 700);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not create game.",
      );
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-game-title"
      >
        <h2 id="create-game-title" className="mb-4 text-2xl font-bold">
          Create a game
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Game code: <strong>{gameCode || "Generated after creation"}</strong>
        </p>
        <label className="mt-6 flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={hasDecoy}
            onChange={(event) => setHasDecoy(event.target.checked)}
            disabled={busy}
          />
          Include a decoy
        </label>
        {error && (
          <p role="alert" className="mt-4 text-sm text-rose-300">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="mt-4 text-sm text-[var(--accent)]">
            {success}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={closeModal}
            disabled={busy}
            className="rounded-xl border border-[var(--line)] px-4 py-3 font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={createGame}
            disabled={busy}
            className="rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#050505] disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create game"}
          </button>
        </div>
      </div>
    </div>
  );
}
