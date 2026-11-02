import { requireUser } from "@/lib/auth";
import { connection } from "next/server";
import { ChatForm } from "@/components/chat-form";

export default async function NewRoomPage() {
  await connection();
  await requireUser("/chats/new");
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
      <p className="text-sm text-[var(--accent)]">Build a space</p>
      <h1 className="mt-2 text-4xl font-bold">Create a chat.</h1>
      <p className="mt-3 text-[var(--muted)]">
        Give your conversation a clear place to start.
      </p>
      <div className="mt-8 rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6 sm:p-8">
        <ChatForm />
      </div>
    </main>
  );
}
