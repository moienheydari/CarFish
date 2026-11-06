import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { joinGameSchema, profileSchema } from "@/lib/validations";

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid profile." },
      { status: 400 },
    );
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("game_code")
    .eq("id", user.id)
    .maybeSingle();
  if (existingProfileError)
    return NextResponse.json(
      { error: "Could not check your game membership." },
      { status: 500 },
    );
  if (!existingProfile?.game_code)
    return NextResponse.json(
      { error: "Join a game before saving your profile." },
      { status: 400 },
    );
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...parsed.data }, { onConflict: "id" })
    .select()
    .single();
  if (error)
    return NextResponse.json(
      { error: "Could not save profile." },
      { status: 500 },
    );
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const body = await request.json();
  if (body.action === "join") {
    const parsed = joinGameSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid game code." },
        { status: 400 },
      );
    const gameCode = parsed.data.game_code.toUpperCase();
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("game_code,has_decoy")
      .eq("game_code", gameCode)
      .eq("phase", "not_started")
      .maybeSingle();
    if (gameError)
      return NextResponse.json({ error: "Could not check game." }, { status: 500 });
    if (!game)
      return NextResponse.json({ error: "Game not found." }, { status: 404 });

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        game_code: game.game_code,
        ...(parsed.data.display_name
          ? { display_name: parsed.data.display_name }
          : {}),
      })
      .eq("id", user.id);
    if (updateError)
      return NextResponse.json({ error: "Could not join game." }, { status: 500 });

    const { data: currentProfile, error: currentProfileError } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    if (currentProfileError)
      return NextResponse.json({ error: "Could not load your profile." }, { status: 500 });

    const { data: gameMaster, error: gameMasterError } = await supabase
      .from("profiles")
      .select("id")
      .eq("game_code", game.game_code)
      .eq("is_gm", true)
      .maybeSingle();
    if (gameMasterError)
      return NextResponse.json({ error: "Could not find the game master." }, { status: 500 });

    if (gameMaster && gameMaster.id !== user.id) {
      const { data: gmChats, error: gmChatsError } = await supabase
        .from("chats")
        .select("id")
        .eq("game_code", game.game_code)
        .eq("chat_type", "with_gm");
      if (gmChatsError)
        return NextResponse.json({ error: "Could not check the game master chat." }, { status: 500 });

      const gmChatIds = (gmChats ?? []).map((chat) => chat.id);
      let memberships: { chat_id: string; user_id: string }[] = [];
      if (gmChatIds.length) {
        const { data, error: membershipsError } = await supabase
          .from("chat_members")
          .select("chat_id,user_id")
          .in("chat_id", gmChatIds)
          .in("user_id", [user.id, gameMaster.id]);
        if (membershipsError)
          return NextResponse.json({ error: "Could not check the game master chat members." }, { status: 500 });
        memberships = data ?? [];
      }

      const playerChat = (gmChats ?? []).find((chat) =>
        (memberships ?? []).some(
          (membership) =>
            membership.chat_id === chat.id && membership.user_id === user.id,
        ),
      );

      if (playerChat) {
        const gmIsMember = (memberships ?? []).some(
          (membership) =>
            membership.chat_id === playerChat.id &&
            membership.user_id === gameMaster.id,
        );
        if (!gmIsMember) {
          const { error: gmMembershipError } = await supabase
            .from("chat_members")
            .insert({ chat_id: playerChat.id, user_id: gameMaster.id });
          if (gmMembershipError)
            return NextResponse.json({ error: "Could not add the game master to the chat." }, { status: 500 });
        }
      } else {
        const { data: gmChat, error: gmChatError } = await supabase
          .from("chats")
          .insert({
            game_code: game.game_code,
            name: `${currentProfile.display_name || "Unnamed player"} Chat with GM`,
            description: "A private conversation with the game master.",
            chat_type: "with_gm",
            created_by: user.id,
          })
          .select()
          .single();
        if (gmChatError || !gmChat)
          return NextResponse.json({ error: "Could not create the game master chat." }, { status: 500 });

        const { error: gmMembershipError } = await supabase
          .from("chat_members")
          .insert([
            { chat_id: gmChat.id, user_id: user.id },
            { chat_id: gmChat.id, user_id: gameMaster.id },
          ]);
        if (gmMembershipError)
          return NextResponse.json({ error: "Could not add members to the game master chat." }, { status: 500 });
      }
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("is_gm,is_decoy")
      .eq("game_code", game.game_code);
    if (profilesError)
      return NextResponse.json({ error: "Could not check game roles." }, { status: 500 });
    return NextResponse.json({
      game_code: game.game_code,
      can_claim_game_master: !profiles.some((profile) => profile.is_gm),
      can_claim_decoy:
        game.has_decoy && !profiles.some((profile) => profile.is_decoy),
    });
  }

  if (body.action !== "claim_game_master" && body.action !== "claim_decoy")
    return NextResponse.json({ error: "Invalid profile action." }, { status: 400 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("game_code")
    .eq("id", user.id)
    .single();
  if (profileError)
    return NextResponse.json({ error: "Could not load profile." }, { status: 500 });

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,is_gm,is_decoy")
    .eq("game_code", profile.game_code);
  if (profilesError)
    return NextResponse.json({ error: "Could not check game roles." }, { status: 500 });

  const field = body.action === "claim_game_master" ? "is_gm" : "is_decoy";
  if (profiles.some((otherProfile) => otherProfile[field] && otherProfile.id !== user.id))
    return NextResponse.json({ error: "That role is already taken." }, { status: 409 });

  if (field === "is_decoy") {
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("has_decoy")
      .eq("game_code", profile.game_code)
      .single();
    if (gameError || !game?.has_decoy)
      return NextResponse.json({ error: "This game does not have a decoy." }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ [field]: true })
    .eq("id", user.id);
  if (updateError)
    return NextResponse.json({ error: "Could not claim role." }, { status: 500 });
  return NextResponse.json({ [field]: true });
}
