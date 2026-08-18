import { fetchJson } from "./fetch";

export interface HnStory {
  title: string;
  points: number;
  num_comments: number;
  created_at: string;
  url: string | null;
  objectID: string;
}

interface HnResponse {
  hits: Array<{
    title?: string | null;
    points?: number | null;
    num_comments?: number | null;
    created_at?: string | null;
    url?: string | null;
    objectID?: string | null;
  }>;
}

/** Search Hacker News (Algolia) for stories matching a query. */
export async function searchHn(query: string, hitsPerPage = 5): Promise<HnStory[]> {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${hitsPerPage}`;
  const data = await fetchJson<HnResponse>(url);
  return (data.hits ?? [])
    .filter((h) => h.title)
    .map((h) => ({
      title: h.title as string,
      points: h.points ?? 0,
      num_comments: h.num_comments ?? 0,
      created_at: h.created_at ?? "",
      url: h.url ?? null,
      objectID: h.objectID ?? "",
    }));
}
