import Anthropic from "@anthropic-ai/sdk";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { detectMoment, rankGifs } from "./claude.ts";
import { config } from "./config.ts";
import { searchGiphy } from "./giphy.ts";
import { createSuggester } from "./suggest.ts";
import { SuggestRequestSchema } from "./types.ts";

if (!config.giphyApiKey) {
  console.error("GIPHY_API_KEY is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
if (!config.token) {
  console.warn("SUGGESTER_TOKEN is empty: any client that can reach this server can use it.");
}

const suggest = createSuggester({
  detectMoment,
  searchGifs: (q) => searchGiphy(q, { apiKey: config.giphyApiKey, rating: config.giphyRating }),
  rankGifs: config.rerank ? rankGifs : undefined,
  minConfidence: config.minConfidence,
});

const MAX_BODY = 64 * 1024;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, x-suggester-token",
  });
  res.end(JSON.stringify(body));
}

function authorized(req: IncomingMessage): boolean {
  if (!config.token) return true;
  const given = Buffer.from(String(req.headers["x-suggester-token"] ?? ""));
  const expected = Buffer.from(config.token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, null);
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
  if (req.method !== "POST" || req.url !== "/suggest") return send(res, 404, { error: "not found" });
  if (!authorized(req)) return send(res, 401, { error: "unauthorized" });

  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: "invalid JSON body" });
  }
  const parsed = SuggestRequestSchema.safeParse(body);
  if (!parsed.success) return send(res, 400, { error: "invalid request", issues: parsed.error.issues });

  const started = Date.now();
  try {
    const result = await suggest(parsed.data);
    console.log(
      `suggest=${result.suggest} confidence=${result.confidence.toFixed(2)} ` +
        `moment=${result.moment ?? "-"} gifs=${result.gifs.length} ${Date.now() - started}ms`,
    );
    send(res, 200, result);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      send(res, 429, { error: "rate limited" });
    } else if (err instanceof Anthropic.AuthenticationError) {
      console.error("Claude API authentication failed: check ANTHROPIC_API_KEY");
      send(res, 502, { error: "upstream auth error" });
    } else if (err instanceof Anthropic.APIError) {
      console.error(`Claude API error ${err.status}:`, err.message);
      send(res, 502, { error: "upstream error" });
    } else {
      console.error(err);
      send(res, 500, { error: "internal error" });
    }
  }
});

server.listen(config.port, () => {
  console.log(`GIF suggester listening on http://localhost:${config.port} (model ${config.model}, effort ${config.effort})`);
});
