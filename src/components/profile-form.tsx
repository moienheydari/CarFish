"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/types/database";
import { createClient } from "@/lib/supabase/browser";

const MAX_PROFILE_IMAGE_SIZE = 15 * 1024 * 1024;
const PROFILE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [values, setValues] = useState({
    display_name: profile?.display_name ?? "",
    profile_image_url: profile?.profile_image_url ?? "",
    game_code: profile?.game_code ?? "FREE",
    bio: profile?.bio ?? "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const router = useRouter();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      let profileImageUrl = values.profile_image_url;
      if (imageFile) {
        const supabase = createClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) throw new Error("Authentication required.");

        const extension = imageFile.type.split("/")[1];
        const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, imageFile, {
            cacheControl: "3600",
            contentType: imageFile.type,
            upsert: false,
          });
        if (uploadError) throw new Error("Could not upload profile image.");
        profileImageUrl = supabase.storage.from("avatars").getPublicUrl(path)
          .data.publicUrl;
      }

      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, profile_image_url: profileImageUrl }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save profile.");

      setMessage("Profile saved successfully!");
      await new Promise((resolve) => setTimeout(resolve, 750));
      router.push("/dashboard");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save profile.",
      );
    } finally {
      setBusy(false);
    }
  }

  function selectImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!PROFILE_IMAGE_TYPES.has(file.type)) {
      setError("Choose a JPEG, PNG, WebP, or GIF image.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_PROFILE_IMAGE_SIZE) {
      setError("Profile images must be 15 MB or smaller.");
      event.target.value = "";
      return;
    }
    setError("");
    setImageFile(file);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium">
        Display name
        <input
          value={values.display_name}
          onChange={(e) =>
            setValues({ ...values, display_name: e.target.value })
          }
          maxLength={50}
          required
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 outline-none focus:border-[var(--accent)]"
        />
      </label>
      <label className="block text-sm font-medium">
        Upload a profile image
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={selectImage}
          className="mt-2 block w-full rounded-xl border border-[var(--line)] bg-[#050505] px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:px-3 file:py-2 file:font-semibold file:text-[#050505]"
        />
        <span className="mt-2 block text-xs text-[var(--muted)]">
          JPEG, PNG, WebP, or GIF up to 15 MB.
          {imageFile ? ` Selected: ${imageFile.name}` : ""}
        </span>
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
