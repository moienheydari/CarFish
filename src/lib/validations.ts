import { z } from "zod";

export const profileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(50, "Display name is too long."),
  bio: z
    .string()
    .trim()
    .max(280, "Bio must be 280 characters or fewer.")
    .optional()
    .default(""),
  profile_image_url: z
    .string()
    .trim()
    .max(2048, "Profile image URL is too long.")
    .optional()
    .default(""),
  game_code: z
    .string()
    .trim()
    .length(4, "Game code must be exactly 4 characters.")
    .regex(/^[A-Za-z0-9]+$/, "Game code must use only letters and numbers."),
});
export const chatSchema = z.object({
  game_code: z
    .string()
    .trim()
    .length(4, "Game code must be exactly 4 characters.")
    .regex(/^[A-Za-z0-9]+$/, "Game code must use only letters and numbers."),
  name: z
    .string()
    .trim()
    .min(3, "Chat name must be at least 3 characters.")
    .max(60, "Chat name must be 60 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(280, "Description must be 280 characters or fewer.")
    .optional()
    .default(""),
  chat_type: z.enum(["public", "private"]).default("public"),
});
export const messageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(500, "Message must be 500 characters or fewer."),
});
export const privateChatSchema = z.object({
  recipient_id: z.string().uuid("Invalid player."),
  game_code: z
    .string()
    .trim()
    .length(4, "Game code must be exactly 4 characters.")
    .regex(/^[A-Za-z0-9]+$/, "Invalid game code."),
});