export type RoomStatus = "waiting" | "active" | "finished";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
};

export type Room = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  status: RoomStatus;
  created_at: string;
  updated_at: string;
  host?: Pick<Profile, "username" | "display_name"> | null;
  member_count?: number;
};

export type Message = {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: Pick<Profile, "username" | "display_name"> | null;
};

export type Participant = {
  user_id: string;
  joined_at: string;
  profile: Pick<Profile, "username" | "display_name"> | null;
};
