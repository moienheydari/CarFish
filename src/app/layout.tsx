import type { Metadata } from "next";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppNav } from "@/components/app-nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChatArena | Rooms for bold conversations",
  description: "A lightweight real-time chatroom competition platform.",
};

// The navigation reads the Supabase session from request cookies.
export const instant = false;

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppNav />
        {children}
      </body>
    </html>
  );
}
