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
        className={`grid h-4 w-4 place-items-center rounded-full border border-white bg-[#050505] text-[10px] font-bold leading-none text-white ${className}`}
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
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar profile={profile} />
            <h2 id="player-profile-title" className="text-xl font-semibold">
              {profile.display_name || "Unnamed player"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="rounded-full border border-[var(--line)] px-3 py-1 text-lg"
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
      width={36}
      height={36}
      unoptimized
      className="h-9 w-9 rounded-full object-cover"
    />
  ) : (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#2a0a0a] text-xs font-semibold text-[var(--accent)]">
      {(profile.display_name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
