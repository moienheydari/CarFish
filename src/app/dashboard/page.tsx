import Link from "next/link";
import { connection } from "next/server";
import { requireUser, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardPage() {
  await connection();
  const user = await requireUser();
  const profile = await getCurrentProfile(user.id);
  const supabase = await createClient();
  const { data: rooms } = await supabase
    .from("rooms")
    .select("id,name,description,status,created_at")
    .order("created_at", { ascending: false })
    .limit(3);
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm text-[var(--accent)]">Your arena</p>
          <h1 className="mt-2 text-4xl font-bold">
            Good to see you, {profile?.username ?? "friend"}.
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/rooms/new"
            className="rounded-full bg-[var(--accent)] px-5 py-3 font-semibold text-[#050505]"
          >
            Create a room
          </Link>
          <SignOutButton />
        </div>
      </div>
      <section className="mt-12">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Fresh rooms</h2>
          <Link href="/rooms" className="text-sm text-[var(--accent)]">
            View all →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {(rooms ?? []).map((room) => (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
              className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 transition hover:-translate-y-1 hover:border-[var(--accent)]"
            >
              <span className="text-xs uppercase tracking-wider text-[var(--accent)]">
                {room.status}
              </span>
              <h3 className="mt-3 font-semibold">{room.name}</h3>
              <p className="mt-2 line-clamp-2 text-sm text-[var(--muted)]">
                {room.description || "A new room ready for ideas."}
              </p>
            </Link>
          ))}
          {!rooms?.length && (
            <div className="rounded-2xl border border-dashed border-[var(--line)] p-8 text-[var(--muted)]">
              No rooms yet. Create the first one.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
