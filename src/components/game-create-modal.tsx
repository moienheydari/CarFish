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
  const [correctScore, setCorrectScore] = useState(3);
  const [existScore, setExistScore] = useState(1);
  const [allowPrivateChats, setAllowPrivateChats] = useState(true);
  const [decoyScore, setDecoyScore] = useState(3);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!open) return null;

  function closeModal() {
    if (busy) return;
    setError("");
    setSuccess("");
    setHasDecoy(false);
    setCorrectScore(3);
    setExistScore(1);
    setAllowPrivateChats(true);
    setDecoyScore(3);
    onClose();
  }

  async function createGame() {
    onBusyChange(true);
    setError("");
    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_code: gameCode,
          has_decoy: hasDecoy,
          correct_score: correctScore,
          exist_score: existScore,
          allow_private_chats: allowPrivateChats,
          decoy_score: hasDecoy ? decoyScore : 0,
        }),
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
        setCorrectScore(3);
        setExistScore(1);
        setAllowPrivateChats(true);
        setDecoyScore(3);
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
        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="text-sm">
            Correct guess score
            <input
              type="number"
              min={0}
              value={correctScore}
              onChange={(event) => setCorrectScore(Number(event.target.value))}
              disabled={busy}
              className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#050505] px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Existing but incorrect score
            <input
              type="number"
              min={0}
              value={existScore}
              onChange={(event) => setExistScore(Number(event.target.value))}
              disabled={busy}
              className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#050505] px-3 py-2"
            />
          </label>
        </div>
        <label className="mt-5 flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={allowPrivateChats}
            onChange={(event) => setAllowPrivateChats(event.target.checked)}
            disabled={busy}
          />
          Allow players to create private chats
        </label>
        {hasDecoy && (
          <label className="mt-4 block text-sm">
            Decoy favorite score
            <input
              type="number"
              min={0}
              value={decoyScore}
              onChange={(event) => setDecoyScore(Number(event.target.value))}
              disabled={busy}
              className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#050505] px-3 py-2"
            />
          </label>
        )}
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
            className="cursor-pointer rounded-xl border border-[var(--line)] px-4 py-3 font-semibold transition hover:border-[var(--accent)] hover:bg-[#2a0a0a] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={createGame}
            disabled={busy}
            className="cursor-pointer rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#050505] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create game"}
          </button>
        </div>
      </div>
    </div>
  );
}
