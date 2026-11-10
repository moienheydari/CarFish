"use client";

import { useMemo, useState } from "react";
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
  useUnreadChatCounts(chats, currentUserId, () => setOpen(true));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-20 flex cursor-pointer items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 font-semibold text-[#050505] shadow-lg transition hover:bg-white hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
                className="cursor-pointer rounded-full border border-[var(--line)] bg-[var(--panel)] p-2 transition hover:border-[var(--accent)] hover:bg-[#2a0a0a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
