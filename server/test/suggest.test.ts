import assert from "node:assert/strict";
import { test } from "node:test";
import { toGif, searchGiphy } from "../src/giphy.ts";
import { applyRanking, createSuggester, interleave } from "../src/suggest.ts";
import type { Gif, MomentDecision } from "../src/types.ts";

const gif = (id: string, query = "q"): Gif => ({
  id,
  title: `gif ${id}`,
  url: `https://media.giphy.com/${id}.gif`,
  preview: `https://media.giphy.com/${id}-small.gif`,
  width: 100,
  height: 100,
  query,
});

const yes: MomentDecision = {
  suggest: true,
  confidence: 0.9,
  moment: "celebration",
  reason: "Team shipped a launch",
  queries: ["celebration dance", "we did it"],
};

const messages = [{ author: "Sam", text: "WE SHIPPED IT 🎉🎉" }];

test("interleave takes the top hit of every query first and dedupes", () => {
  const out = interleave([[gif("a"), gif("b")], [gif("c"), gif("a")], [gif("d")]]);
  assert.deepEqual(out.map((g) => g.id), ["a", "c", "d", "b"]);
});

test("applyRanking orders by ranked ids and ignores unknown ids", () => {
  const out = applyRanking([gif("a"), gif("b"), gif("c")], ["c", "zzz", "a"]);
  assert.deepEqual(out.map((g) => g.id), ["c", "a"]);
});

test("applyRanking keeps search order when the ranking is empty or useless", () => {
  const c = [gif("a"), gif("b")];
  assert.equal(applyRanking(c, null), c);
  assert.equal(applyRanking(c, ["nope"]), c);
});

test("suggester returns ranked GIFs for a good moment", async () => {
  const suggest = createSuggester({
    detectMoment: async () => yes,
    searchGifs: async (q) => (q === "celebration dance" ? [gif("a", q), gif("b", q)] : [gif("c", q)]),
    rankGifs: async () => ["c", "b", "a"],
    minConfidence: 0.6,
  });
  const res = await suggest({ messages });
  assert.equal(res.suggest, true);
  assert.equal(res.moment, "celebration");
  assert.deepEqual(res.gifs.map((g) => g.id), ["c", "b", "a"]);
});

test("suggester declines below the confidence threshold without searching", async () => {
  let searched = false;
  const suggest = createSuggester({
    detectMoment: async () => ({ ...yes, confidence: 0.4 }),
    searchGifs: async () => {
      searched = true;
      return [];
    },
    minConfidence: 0.6,
  });
  const res = await suggest({ messages });
  assert.equal(res.suggest, false);
  assert.equal(res.confidence, 0.4);
  assert.equal(searched, false);
});

test("suggester declines when the model refuses or says no", async () => {
  for (const decision of [null, { ...yes, suggest: false }]) {
    const suggest = createSuggester({
      detectMoment: async () => decision,
      searchGifs: async () => [gif("a")],
      minConfidence: 0.6,
    });
    assert.equal((await suggest({ messages })).suggest, false);
  }
});

test("suggester survives a failing search query and a failing rerank", async () => {
  const suggest = createSuggester({
    detectMoment: async () => yes,
    searchGifs: async (q) => {
      if (q === "we did it") throw new Error("boom");
      return [gif("a", q), gif("b", q)];
    },
    rankGifs: async () => {
      throw new Error("rerank down");
    },
    minConfidence: 0.6,
  });
  const res = await suggest({ messages });
  assert.deepEqual(res.gifs.map((g) => g.id), ["a", "b"]);
});

test("suggester caches identical requests", async () => {
  let calls = 0;
  const suggest = createSuggester({
    detectMoment: async () => {
      calls++;
      return yes;
    },
    searchGifs: async (q) => [gif("a", q)],
    minConfidence: 0.6,
  });
  await suggest({ messages });
  await suggest({ messages });
  assert.equal(calls, 1);
});

test("toGif prefers alt text and skips items without images", () => {
  const g = toGif(
    {
      id: "x",
      title: "Title",
      alt_text: "Alt",
      images: {
        downsized_medium: { url: "https://full" },
        fixed_height_small: { url: "https://small", width: "150", height: "100" },
      },
    },
    "q",
  );
  assert.equal(g?.title, "Alt");
  assert.equal(g?.url, "https://full");
  assert.equal(g?.preview, "https://small");
  assert.equal(g?.width, 150);
  assert.equal(toGif({ id: "y", images: {} }, "q"), null);
});

test("searchGiphy builds the request and maps results", async () => {
  let requested = "";
  const fetchImpl = (async (url: string) => {
    requested = url;
    return new Response(
      JSON.stringify({ data: [{ id: "1", title: "Yay", images: { original: { url: "https://o" } } }] }),
    );
  }) as unknown as typeof fetch;
  const gifs = await searchGiphy("slow clap", { apiKey: "k", rating: "pg", fetchImpl });
  const url = new URL(requested);
  assert.equal(url.searchParams.get("q"), "slow clap");
  assert.equal(url.searchParams.get("rating"), "pg");
  assert.deepEqual(gifs.map((g) => g.id), ["1"]);
});
