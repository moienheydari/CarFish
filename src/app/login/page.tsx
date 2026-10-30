import { LoginButton } from "@/components/login-button";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-5 py-16">
      <div className="w-full rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-8 text-center">
        <div className="mx-auto mb-6 grid size-14 place-items-center rounded-2xl bg-[var(--accent)] text-2xl text-[#07111f]">
          ✦
        </div>
        <h1 className="text-3xl font-bold">Welcome to ChatArena</h1>
        <p className="mt-3 text-[var(--muted)]">
          Sign in to find your people and join the conversation.
        </p>
        <LoginButton searchParams={searchParams} />
        <p className="mt-5 text-xs leading-5 text-[var(--muted)]">
          Google sign-in requires the provider to be enabled in your Supabase
          project.
        </p>
      </div>
    </main>
  );
}
