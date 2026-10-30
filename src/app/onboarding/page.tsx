import { requireUser, getCurrentProfile } from "@/lib/auth";
import { connection } from "next/server";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function OnboardingPage() {
  await connection();
  const user = await requireUser("/onboarding");
  const profile = await getCurrentProfile(user.id);
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-5 py-16">
      <div className="w-full rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-8">
        <p className="text-sm text-[var(--accent)]">One quick step</p>
        <h1 className="mt-2 text-3xl font-bold">Choose your arena name</h1>
        <p className="mt-3 text-[var(--muted)]">
          This is how other participants will see you.
        </p>
        <OnboardingForm initialUsername={profile?.username ?? ""} />
      </div>
    </main>
  );
}
