"use client";

import { LoginButton } from "@/components/login-button";
import Image from "next/image";
import icon from "@/images/icon.png";
import { useState } from "react";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-5 py-16">
      <div className="w-full rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-8 text-center">
        <div className="mx-auto mb-3 size-18 place-items-center rounded-2xl">
          <Image
            src={icon}
            alt="Logo image"
            width={400}
            height={400}
            className="h-auto w-full object-contain"
          />
        </div>
        <h1 className="text-3xl font-bold">
          Welcome to Car
          <span className={mode === "login" ? "text-[var(--accent)]" : "text-[#2f00ff]"}>Fish</span>
        </h1>
      <p className="mt-3 text-[var(--muted)]">
        Sign in or create an account to find your people and join the
        conversation.
      </p>
      <LoginButton
        mode={mode}
        setMode={setMode}
        searchParams={searchParams}
      />
    </div>
    </main >
  );
}
