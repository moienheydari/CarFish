"use client";

import { useState } from "react";
import Image from "next/image";
import type { Profile } from "@/types/database";

export function ProfileButton({
  profile,
  className = "",
}: {
  profile: Profile;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={`View ${profile.display_name || "player"} profile`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className={`flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-white bg-[#050505] p-0 text-xs font-bold leading-none text-white transition hover:border-[var(--accent)] hover:bg-[#2a0a0a] ${className}`}
      >
        !
      </button>
      {open && (
        <ProfileModal profile={profile} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ProfileModal({
  profile,
  onClose,
}: {
  profile: Profile;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-profile-title"
      >
        <div className="relative">
          <div className="flex flex-col items-center text-center">
            <Avatar profile={profile} />
            <h2 id="player-profile-title" className="mt-2 text-3xl font-semibold">
              {profile.display_name || "Unnamed player"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="absolute right-0 top-0 cursor-pointer rounded-full border border-[var(--line)] px-3 py-1 text-lg transition hover:border-[var(--accent)] hover:bg-[#2a0a0a]"
          >
            ×
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <ProfileField label="Age" value={profile.age?.toString() || "Not provided"} />
          <ProfileField label="Job" value={profile.job || "Not provided"} />
          <div className="rounded-xl border border-[var(--line)] p-3 sm:col-span-2">
            <p className="text-xs text-[var(--muted)]">Bio</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">
              {profile.bio || "No bio provided."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] p-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function Avatar({ profile }: { profile: Profile }) {
  return profile.profile_image_url ? (
    <Image
      src={profile.profile_image_url}
      alt=""
      width={128}
      height={128}
      unoptimized
      className="h-50 w-50 rounded-full object-cover"
    />
  ) : (
    <span className="grid h-50 w-50 shrink-0 place-items-center rounded-full bg-[#2a0a0a] text-4xl font-semibold text-[var(--accent)]">
      {(profile.display_name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
