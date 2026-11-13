import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import logo from "@/images/logo.png";

export const instant = false;

export default async function Home() {
  await connection();
  const user = await getCurrentUser();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-20">
      <div className="grid w-full gap-14 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
        <section>
          <h1 className="max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
            Car<span className="text-[var(--accent)]">Fish</span>
          </h1>
          <p className="ml-3 mt-0 max-w-xl text-xs leading-8 text-[var(--muted)]">
            Inspired by the show GameChanger.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href={user ? "/dashboard" : "/login"}
              className="rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-[#050505] transition hover:bg-white"
            >
              Let's Play!
            </Link>
          </div>
        </section>
        <Image
          src={logo}
          alt="Logo image"
          width={400}
          height={400}
          className="h-auto w-full object-contain"
        />
      </div>
    </main>
  );
}
