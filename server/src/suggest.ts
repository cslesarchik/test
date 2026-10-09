import { createHash } from "node:crypto";
import type { ChatMessage, Gif, MomentDecision, SuggestRequest, SuggestResponse } from "./types.ts";

export interface SuggestDeps {
  detectMoment(messages: ChatMessage[], draft?: string): Promise<MomentDecision | null>;
  searchGifs(query: string): Promise<Gif[]>;
  /** Returns candidate ids best first, or null to keep search order. */
  rankGifs?(
    decision: MomentDecision,
    messages: ChatMessage[],
    draft: string | undefined,
    candidates: Gif[],
  ): Promise<string[] | null>;
  minConfidence: number;
  maxGifs?: number;
}

const NO_SUGGESTION: SuggestResponse = { suggest: false, confidence: 0, gifs: [] };

/** Round-robin across query result lists so the top hit of every query is seen first. */
export function interleave(lists: Gif[][]): Gif[] {
  const seen = new Set<string>();
  const out: Gif[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const gif = list[i];
      if (gif && !seen.has(gif.id)) {
        seen.add(gif.id);
        out.push(gif);
      }
    }
  }
  return out;
}

export function applyRanking(candidates: Gif[], rankedIds: string[] | null): Gif[] {
  if (!rankedIds?.length) return candidates;
  const byId = new Map(candidates.map((g) => [g.id, g]));
  const ranked = rankedIds.map((id) => byId.get(id)).filter((g): g is Gif => g !== undefined);
  return ranked.length ? ranked : candidates;
}

export function createSuggester(deps: SuggestDeps) {
  const cache = new Map<string, SuggestResponse>();
  const CACHE_LIMIT = 500;
  const maxGifs = deps.maxGifs ?? 3;

  async function run({ messages, draft }: SuggestRequest): Promise<SuggestResponse> {
    const decision = await deps.detectMoment(messages, draft);
    if (!decision?.suggest || decision.confidence < deps.minConfidence || !decision.queries.length) {
      return { ...NO_SUGGESTION, confidence: decision?.confidence ?? 0 };
    }

    const settled = await Promise.allSettled(decision.queries.map((q) => deps.searchGifs(q)));
    settled.forEach((s, i) => {
      if (s.status === "rejected") console.warn(`GIF search "${decision.queries[i]}" failed:`, String(s.reason));
    });
    const candidates = interleave(
      settled.map((s) => (s.status === "fulfilled" ? s.value : [])),
    ).slice(0, 12);
    if (!candidates.length) return { ...NO_SUGGESTION, confidence: decision.confidence };

    let ordered = candidates;
    if (deps.rankGifs && candidates.length > 1) {
      try {
        ordered = applyRanking(candidates, await deps.rankGifs(decision, messages, draft, candidates));
      } catch (err) {
        console.warn("rerank failed, keeping search order:", err);
      }
    }

    return {
      suggest: true,
      confidence: decision.confidence,
      moment: decision.moment,
      reason: decision.reason,
      gifs: ordered.slice(0, maxGifs),
    };
  }

  return async function suggest(req: SuggestRequest): Promise<SuggestResponse> {
    const key = createHash("sha256").update(JSON.stringify(req)).digest("hex");
    const hit = cache.get(key);
    if (hit) return hit;
    const result = await run(req);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return result;
  };
}
