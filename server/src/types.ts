import { z } from "zod";

export const ChatMessageSchema = z.object({
  author: z.string().max(100).optional(),
  text: z.string().max(2000),
  self: z.boolean().optional(),
});

export const SuggestRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).max(30),
  draft: z.string().max(2000).optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type SuggestRequest = z.infer<typeof SuggestRequestSchema>;

export const MOMENTS = [
  "celebration",
  "laughter",
  "frustration",
  "surprise",
  "agreement",
  "sarcasm",
  "greeting",
  "farewell",
  "gratitude",
  "awkward",
  "hype",
  "light_sympathy",
  "other",
] as const;

export type Moment = (typeof MOMENTS)[number];

export interface MomentDecision {
  suggest: boolean;
  confidence: number;
  moment: Moment;
  reason: string;
  queries: string[];
}

export interface Gif {
  id: string;
  title: string;
  /** Full-size GIF URL, inserted into the message. */
  url: string;
  /** Small preview for the suggestion panel. */
  preview: string;
  width: number;
  height: number;
  /** Search query that produced this result. */
  query: string;
}

export interface SuggestResponse {
  suggest: boolean;
  confidence: number;
  moment?: Moment;
  reason?: string;
  gifs: Gif[];
}
