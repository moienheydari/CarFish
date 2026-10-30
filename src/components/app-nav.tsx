import Link from "next/link";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export async function AppNav() {
  const user = await getCurrentUser();
  const profile = user ? await getCurrentProfile(user.id) : null;
  return (
    <header className="border-b border-[var(--line)] bg-[#07111f]/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="grid size-8 place-items-center rounded-xl bg-[var(--accent)] text-[#07111f]">
            ✦
          </span>
          <span>
            Chat<span className="text-[var(--accent)]">Arena</span>
          </span>
        </Link>
        <div className="flex items-center gap-5 text-sm text-[var(--muted)]">
          {user ? (
            <>
              <Link href="/rooms" className="transition hover:text-white">
                Rooms
              </Link>
              <Link
                href="/profile"
                className="hidden transition hover:text-white sm:block"
              >
                {profile?.username ?? "Profile"}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-[var(--accent)] px-4 py-2 font-semibold text-[#07111f] transition hover:bg-white"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
