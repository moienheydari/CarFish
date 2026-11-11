import { connection } from "next/server";
import { Fragment } from "react";
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
import type { Chat, GamePhase, Profile, Round, Vote } from "@/types/database";

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

  const chatColumns =
    "id,game_code,name,description,created_by,chat_type,status,created_at,updated_at";
  const profileColumns =
    "id,real_name,display_name,profile_image_url,job,age,bio,is_gm,is_decoy,score,current_score,game_code,created_at,updated_at";

  const [{ data: game }, { data: initialChatRows }, { data: profiles }, { data: roundRows }, { data: userMemberships }] =
    await Promise.all([
      supabase
        .from("games")
        .select("phase,correct_score,exist_score,allow_private_chats,decoy_favorite_id")
        .eq("game_code", profile.game_code)
        .single(),
      supabase
        .from("chats")
        .select(chatColumns)
        .eq("game_code", profile.game_code)
        .order("created_at", { ascending: true }),
      supabase
        .from("profiles")
        .select(profileColumns)
        .eq("game_code", profile.game_code)
        .order("updated_at", { ascending: false }),
      supabase
        .from("rounds")
        .select("id,game_code,round_number,status,finalized_at")
        .eq("game_code", profile.game_code)
        .order("round_number", { ascending: false }),
      supabase
        .from("chat_members")
        .select("chat_id,user_id")
        .eq("user_id", user.id),
    ]);
  const rounds = (roundRows ?? []) as Round[];
  const activeRound = rounds.find((round) => round.status === "active") ?? null;
  const chatRows = initialChatRows;

  const players = (profiles ?? []).filter((item) => !item.is_gm);
  const userChatIds = (userMemberships ?? []).map((membership) => membership.chat_id);
  const votesQuery = supabase
    .from("votes")
    .select("id,game_code,round_id,voter_id,target_id,guess,status,vote_kind,created_at,updated_at")
    .eq("game_code", profile.game_code);
  if (!profile.is_gm) votesQuery.eq("round_id", activeRound?.id ?? "");
  const [{ data: userChats }, { data: votes }, { data: finalGuessCounts }] =
    await Promise.all([
      userChatIds.length
        ? supabase
          .from("chat_members")
          .select("chat_id,user_id")
          .in("chat_id", userChatIds)
        : Promise.resolve({ data: [] as { chat_id: string; user_id: string }[] }),
      votesQuery,
      game?.phase === "final"
        ? supabase.rpc("get_final_guess_counts", {
          p_game_code: profile.game_code,
        })
        : Promise.resolve({ data: null }),
    ]);
  const correctGuessCounts = Object.fromEntries(
    (finalGuessCounts ?? []).map((item: {
      target_id: string;
      correct_guess_count: number | string;
    }) => [
        item.target_id,
        Number(item.correct_guess_count),
      ]),
  );
  const userChatsIds = new Set(userChatIds);
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
    <main className={`mx-auto w-full max-w-[1600px] flex-1 py-5 ${profile.is_gm ? "px-10" : "px-25"}`}>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm text-[var(--accent)]">Your arena, Good Luck {profile?.display_name ?? "friend"}!</p>
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
            roundId={activeRound?.id ?? ""}
            rounds={rounds}
            initialPhase={(game?.phase ?? "not_started") as GamePhase}
            initialAllowPrivateChats={game?.allow_private_chats ?? true}
            mentionableProfiles={(profiles ?? []) as Profile[]}
          />
        ) : (
          <Fragment key={game?.phase}>
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
          </Fragment>
        )}
      </GamePhaseSync>
    </main>
  );
}
