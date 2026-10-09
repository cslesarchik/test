import type { Gif } from "./types.ts";

interface GiphyImage {
  url?: string;
  width?: string;
  height?: string;
}

interface GiphyItem {
  id: string;
  title?: string;
  alt_text?: string;
  images: Record<string, GiphyImage | undefined>;
}

export function toGif(item: GiphyItem, query: string): Gif | null {
  const full = item.images.downsized_medium ?? item.images.original;
  const preview = item.images.fixed_height_small ?? item.images.fixed_height ?? full;
  if (!full?.url || !preview?.url) return null;
  return {
    id: item.id,
    title: (item.alt_text || item.title || "").slice(0, 200),
    url: full.url,
    preview: preview.url,
    width: Number(preview.width ?? 0),
    height: Number(preview.height ?? 0),
    query,
  };
}

export interface SearchOptions {
  apiKey: string;
  rating: string;
  limit?: number;
  fetchImpl?: typeof fetch;
}

export async function searchGiphy(query: string, opts: SearchOptions): Promise<Gif[]> {
  const params = new URLSearchParams({
    api_key: opts.apiKey,
    q: query,
    limit: String(opts.limit ?? 6),
    rating: opts.rating,
    lang: "en",
  });
  const res = await (opts.fetchImpl ?? fetch)(`https://api.giphy.com/v1/gifs/search?${params}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`GIPHY search failed: ${res.status}`);
  const body = (await res.json()) as { data?: GiphyItem[] };
  return (body.data ?? []).map((item) => toGif(item, query)).filter((g): g is Gif => g !== null);
}
