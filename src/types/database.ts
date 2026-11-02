export type ChatType = "public" | "private";
export type ChatStatus = "open" | "locked";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  profile_image_url: string | null;
  bio: string | null;
  is_gm: boolean;
  created_at: string;
  updated_at: string;
};

export type Chat = {
  id: string;
  game_code: string;
  name: string;
  description: string | null;
  created_by: string;
  chat_type: ChatType;
  status: ChatStatus;
  created_at: string;
  updated_at: string;
  host?: Pick<Profile, "username" | "display_name"> | null;
  member_count?: number;
};

export type Message = {
  id: string;
  chat_id: string;
  game_code: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: Pick<Profile, "username" | "display_name"> | null;
};

export type Participant = {
  user_id: string;
  joined_at: string;
  profile: Pick<Profile, "username" | "display_name" | "profile_image_url"> | null;
};
