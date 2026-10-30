import { requireUser, getCurrentProfile } from "@/lib/auth";
import { ProfileForm } from "@/components/profile-form";

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const profile = await getCurrentProfile(user.id);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
      <p className="text-sm text-[var(--accent)]">Your profile</p>
      <h1 className="mt-2 text-4xl font-bold">Make it yours.</h1>
      <p className="mt-3 text-[var(--muted)]">
        Only your public profile fields are visible to other participants.
      </p>
      <div className="mt-8 rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6 sm:p-8">
        <ProfileForm profile={profile} />
      </div>
    </main>
  );
}
