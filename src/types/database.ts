export type ChatType = "public" | "private" | "with_gm";
export type ChatStatus = "open" | "locked";
export type GamePhase = "not_started" | "chat_phase" | "vote_phase" | "final";
export type VoteStatus = "unlocked" | "pending" | "correct" | "exists" | "none";
export type VoteKind = "guess" | "decoy_favorite";
export type RoundStatus = "active" | "finalized";

export type Round = {
  id: string;
  game_code: string;
  round_number: number;
  status: RoundStatus;
  finalized_at: string | null;
};

export type RoundScore = {
  round_id: string;
  user_id: string;
  points: number;
};

export type Game = {
  game_code: string;
  phase: GamePhase;
  has_decoy: boolean;
  allow_private_chats: boolean;
  decoy_score: number;
  decoy_favorite_id: string | null;
  correct_score: number;
  exist_score: number;
};

export type Profile = {
  id: string;
  real_name: string | null;
  display_name: string | null;
  profile_image_url: string | null;
  job: string | null;
  age: number | null;
  bio: string | null;
  is_gm: boolean;
  is_decoy: boolean;
  score: number;
  current_score: number;
  game_code: string;
  created_at: string;
  updated_at: string;
};

export type Vote = {
  id: string;
  game_code: string;
  round_id: string;
  voter_id: string;
  target_id: string;
  guess: string;
  status: VoteStatus;
  vote_kind: VoteKind;
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
  host?: Pick<Profile, "display_name"> | null;
  member_count?: number;
};

export type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: Pick<Profile, "display_name"> | null;
};

export type Participant = {
  user_id: string;
  joined_at: string;
  profile: Pick<Profile, "display_name" | "profile_image_url"> | null;
};
