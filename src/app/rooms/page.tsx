import Link from "next/link";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function RoomsPage() {
  await connection();
  await requireUser("/rooms");
  const supabase = await createClient();
  const { data: rooms } = await supabase
    .from("rooms")
    .select(
      "id,name,description,status,created_at,host:profiles!rooms_created_by_fkey(username),room_members(count)",
    )
    .order("created_at", { ascending: false });
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm text-[var(--accent)]">Find your room</p>
          <h1 className="mt-2 text-4xl font-bold">The arena is open.</h1>
        </div>
        <Link
          href="/rooms/new"
          className="rounded-full bg-[var(--accent)] px-5 py-3 font-semibold text-[#050505]"
        >
          New room
        </Link>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(rooms ?? []).map((room) => (
          <Link
            key={room.id}
            href={`/rooms/${room.id}`}
            className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 transition hover:-translate-y-1 hover:border-[var(--accent)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                {room.status}
              </span>
              <span className="text-xs text-[var(--muted)]">
                {room.room_members?.[0]?.count ?? 0} members
              </span>
            </div>
            <h2 className="mt-5 text-xl font-semibold">{room.name}</h2>
            <p className="mt-2 min-h-12 text-sm text-[var(--muted)]">
              {room.description || "No description yet."}
            </p>
            <p className="mt-6 text-xs text-[var(--muted)]">
              Hosted by @
              {(room.host as { username?: string } | null)?.username ??
                "unknown"}
            </p>
          </Link>
        ))}
        {!rooms?.length && (
          <p className="text-[var(--muted)]">
            No rooms yet. Start the first conversation.
          </p>
        )}
      </div>
    </main>
  );
}
