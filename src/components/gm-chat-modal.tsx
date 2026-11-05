"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { ChatBox } from "@/components/chat-box";
import { useUnreadChatCounts } from "@/hooks/use-unread-chat-counts";
import type { Chat } from "@/types/database";

export function GmChatModal({
  chat,
  currentUserId,
}: {
  chat: Chat;
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const chats = useMemo(() => [chat], [chat]);
  const unreadCounts = useUnreadChatCounts(chats, currentUserId);

  useEffect(() => {
    if (unreadCounts[chat.id] <= 0) return;
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [chat.id, unreadCounts]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 font-semibold text-[#050505] shadow-lg"
      >
        <MessageCircle size={18} />
        Chat with GM
      </button>
      {open && (
        <div
          className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-black/70 p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close game master chat"
                className="rounded-full border border-[var(--line)] bg-[var(--panel)] p-2"
              >
                <X size={18} />
              </button>
            </div>
            <ChatBox
              chat={chat}
              currentUserId={currentUserId}
              canSend
              canManage={false}
            />
          </div>
        </div>
      )}
    </>
  );
}
