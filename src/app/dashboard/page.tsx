import { connection } from "next/server";
import { requireUser, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { GmPanel } from "@/components/gm-panel";
import { GmChatModal } from "@/components/gm-chat-modal";
import { PlayerPanel } from "@/components/player-panel";
import { IntroductionPanel } from "@/components/introduction-panel";
import { VotePanel } from "@/components/vote-panel";
import { FinalPanel } from "@/components/final-panel";
import { GamePhaseSync } from "@/components/game-phase-sync";
import type { Chat, GamePhase, Profile, Vote } from "@/types/database";

export const instant = false;

export default async function DashboardPage() {
  await connection();
  const user = await requireUser();
  const profile = await getCurrentProfile(user.id);
  const supabase = await createClient();
  if (!profile || (!profile.is_gm &&
    [profile.game_code, profile.real_name, profile.display_name].some((value) => !value?.trim(),)))
    return (
      <main className="mx-auto flex-1 px-5 py-12">
        <p className="text-rose-300">Complete your profile to enter the game.</p>
        <a href="/profile" className="text-[var(--accent)] underline">
          Go to profile
        </a>
      </main>
    );

  const { data: game } = await supabase
    .from("games")
    .select("phase,correct_score,exist_score,allow_private_chats,decoy_favorite_id")
    .eq("game_code", profile.game_code)
    .single();

  let { data: chatRows } = await supabase
    .from("chats")
    .select("*")
    .eq("game_code", profile.game_code)
    .order("created_at", { ascending: true });

  // If the user is a GM and there are no public chats, create one
  if (profile.is_gm && !chatRows?.some((chat) => chat.chat_type === "public")) {
    await supabase.from("chats").insert({
      game_code: profile.game_code,
      name: "Public Chat",
      description: "The shared chat for this game (${{ profile.game_code }}).",
      chat_type: "public",
      created_by: user.id,
    });
    const refreshed = await supabase
      .from("chats")
      .select("*")
      .eq("game_code", profile.game_code)
      .order("created_at", { ascending: true });
    chatRows = refreshed.data;
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .eq("game_code", profile.game_code)
    .order("updated_at", { ascending: false });
  const players = (profiles ?? []).filter((item) => !item.is_gm);
  const { data: activeRound } = await supabase
    .from("rounds")
    .select("id")
    .eq("game_code", profile.game_code)
    .eq("status", "active")
    .maybeSingle();
  const { data: votes } = await supabase
    .from("votes")
    .select("*")
    .eq("game_code", profile.game_code)
    .eq("round_id", activeRound?.id ?? "");
  const { data: finalGuessCounts } =
    game?.phase === "final"
      ? await supabase.rpc("get_final_guess_counts", {
        p_game_code: profile.game_code,
      })
      : { data: null };
  const correctGuessCounts = Object.fromEntries(
    (finalGuessCounts ?? []).map((item: {
      target_id: string;
      correct_guess_count: number | string;
    }) => [
      item.target_id,
      Number(item.correct_guess_count),
    ]),
  );
  const { data: userChats } = await supabase
    .from("chat_members")
    .select("chat_id,user_id");
  const userChatsIds = new Set(
    (userChats ?? [])
      .filter((item) => item.user_id === user.id)
      .map((item) => item.chat_id),
  );
  const chats = (chatRows ?? []).filter(
    (chat) =>
      profile.is_gm ||
      (chat.chat_type !== "with_gm" &&
        (chat.chat_type === "public" || userChatsIds.has(chat.id))),
  ) as Chat[];
  const gmChat = profile.is_gm
    ? null
    : ((chatRows ?? []).find(
      (chat) => chat.chat_type === "with_gm" && userChatsIds.has(chat.id),
    ) as Chat | undefined) ?? null;
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm text-[var(--accent)]">Your arena</p>
          <h1 className="mt-2 text-4xl font-bold">
            Good to see you, {profile?.display_name ?? "friend"}.
          </h1>
        </div>
        <SignOutButton />
      </div>
      <GamePhaseSync gameCode={profile.game_code}>
        {profile.is_gm ? (
          <GmPanel
            players={(players ?? []) as Profile[]}
            votes={(votes ?? []) as Vote[]}
            chats={chats}
            currentUserId={user.id}
            gameCode={profile.game_code}
            initialPhase={(game?.phase ?? "not_started") as GamePhase}
            initialAllowPrivateChats={game?.allow_private_chats ?? true}
            mentionableProfiles={(profiles ?? []) as Profile[]}
          />
        ) : (
          <>
            {game?.phase === "not_started" ? (
              <>
                <IntroductionPanel
                  players={(players ?? []) as Profile[]}
                  gameCode={profile.game_code}
                />
                {gmChat && (
                  <GmChatModal chat={gmChat} currentUserId={user.id} />
                )}
              </>
            ) : game?.phase === "vote_phase" ? (
              <>
                <VotePanel
                  players={(players ?? []) as Profile[]}
                  currentUserId={user.id}
                  gameCode={profile.game_code}
                  roundId={activeRound?.id ?? ""}
                  isDecoy={profile.is_decoy}
                  initialVotes={(votes ?? []) as Vote[]}
                />
                {gmChat && (
                  <GmChatModal chat={gmChat} currentUserId={user.id} />
                )}
              </>
            ) : game?.phase === "final" ? (
              <FinalPanel
                players={(players ?? []) as Profile[]}
                correctGuessCounts={correctGuessCounts}
              />
            ) : (
              <>
                <PlayerPanel
                  players={(players ?? []) as Profile[]}
                  initialChats={chats}
                  initialChatMembers={userChats ?? []}
                  currentUserId={user.id}
                  gameCode={profile.game_code}
                  allowPrivateChats={game?.allow_private_chats ?? true}
                  mentionableProfiles={(profiles ?? []) as Profile[]}
                />
                {gmChat && (
                  <GmChatModal chat={gmChat} currentUserId={user.id} />
                )}
              </>
            )}
          </>
        )}
      </GamePhaseSync>
    </main>
  );
}
