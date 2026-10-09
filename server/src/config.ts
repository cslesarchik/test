const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

function effortFromEnv(value: string | undefined): Effort {
  return EFFORTS.includes(value as Effort) ? (value as Effort) : "low";
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  model: process.env.CLAUDE_MODEL ?? "claude-opus-5-5",
  effort: effortFromEnv(process.env.CLAUDE_EFFORT),
  giphyApiKey: process.env.GIPHY_API_KEY ?? "",
  giphyRating: process.env.GIPHY_RATING ?? "pg",
  token: process.env.SUGGESTER_TOKEN ?? "",
  minConfidence: Number(process.env.MIN_CONFIDENCE ?? 0.6),
  rerank: process.env.RERANK !== "false",
};
