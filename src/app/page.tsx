import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-20">
      <div className="grid w-full gap-14 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
        <section>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[.25em] text-[var(--accent)]">
            A better room for a better conversation
          </p>
          <h1 className="max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
            Bring your <span className="text-[var(--accent)]">boldest</span>{" "}
            ideas to the arena.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[var(--muted)]">
            ChatArena gives small groups a focused place to meet, talk, and
            start friendly competition sessions when the room is ready.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href={user ? "/dashboard" : "/login"}
              className="rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-[#07111f] transition hover:bg-white"
            >
              {user ? "Open dashboard" : "Enter the arena"}{" "}
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/rooms"
              className="rounded-full border border-[var(--line)] px-6 py-3 font-semibold transition hover:border-[var(--accent)]"
            >
              Explore rooms
            </Link>
          </div>
        </section>
        <div className="relative rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-2xl shadow-black/20">
          <div className="absolute -right-4 -top-4 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[#07111f]">
            LIVE CHAT
          </div>
          <div className="mb-8 flex items-center justify-between border-b border-[var(--line)] pb-5">
            <div>
              <p className="font-semibold">Friday Night Ideas</p>
              <p className="text-sm text-[var(--muted)]">
                12 participants · waiting
              </p>
            </div>
            <span className="size-3 rounded-full bg-[var(--accent)] shadow-[0_0_18px_var(--accent)]" />
          </div>
          <div className="space-y-5">
            <div>
              <p className="mb-1 text-xs text-[var(--muted)]">mika · 8:42 PM</p>
              <div className="inline-block rounded-2xl rounded-tl-sm bg-[#18304a] px-4 py-3 text-sm">
                What should we build next?
              </div>
            </div>
            <div className="text-right">
              <p className="mb-1 text-xs text-[var(--muted)]">you · 8:43 PM</p>
              <div className="inline-block rounded-2xl rounded-tr-sm bg-[var(--accent)] px-4 py-3 text-left text-sm text-[#07111f]">
                Something worth showing off.
              </div>
            </div>
          </div>
          <div className="mt-8 rounded-xl border border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)]">
            Message the room...
          </div>
        </div>
      </div>
    </main>
  );
}
