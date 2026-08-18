import type { Candidate } from "../types";
import { fetchJson } from "../web/fetch";
import { searchHn } from "../web/hn";
import { slugify } from "../util";

interface YcCompany {
  id?: number;
  name?: string;
  slug?: string;
  website?: string | null;
  oneLiner?: string | null;
  teamSize?: number | null;
  url?: string;
  batch?: string | null;
}

interface YcPage {
  companies?: YcCompany[];
  totalPages?: number;
}

const YC_API = "https://api.ycombinator.com/v0.1/companies";

/** Feed mode: YC batch (via public API), HN (Algolia), or Product Hunt. */
export async function discoverFeed(feed: "yc" | "producthunt" | "hn", batch?: string): Promise<Candidate[]> {
  switch (feed) {
    case "yc":
      return discoverYc(batch);
    case "hn":
      return discoverHn();
    case "producthunt":
      throw new Error("feed 'producthunt' is not implemented — use --source urls with a Product Hunt page");
  }
}

async function discoverYc(batch?: string): Promise<Candidate[]> {
  // No batch -> the demo default: all of YC 2025 (W25 + S25).
  const batches = batch ? [batch] : ["W25", "S25"];
  const out: Candidate[] = [];

  for (const b of batches) {
    let page = 1;
    let totalPages = 1;
    do {
      const data = await fetchJson<YcPage>(`${YC_API}?batch=${encodeURIComponent(b)}&page=${page}`);
      totalPages = data.totalPages ?? page;
      for (const c of data.companies ?? []) {
        const name = c.name ?? "";
        if (!name) continue;
        out.push({
          id: c.slug || slugify(name),
          name,
          website: c.website ?? null,
          oneLiner: c.oneLiner ?? null,
          founders: [],
          teamSignal: c.teamSize ? `Team size: ${c.teamSize}` : null,
          tractionSignal: {
            type: "launch",
            value: `YC ${c.batch ?? b} batch`,
            sourceUrl: c.url ?? `https://www.ycombinator.com/companies/${c.slug ?? ""}`,
            date: null,
          },
          sourceUrls: [c.url ?? `${YC_API}`],
        });
      }
      page++;
    } while (page <= totalPages);
  }
  return out;
}

async function discoverHn(): Promise<Candidate[]> {
  const stories = await searchHn("Show HN", 20);
  return stories.map((s, i) => {
    const url = s.url ?? `https://news.ycombinator.com/item?id=${s.objectID}`;
    return {
      id: slugify(s.title) || `hn-${i}`,
      name: s.title,
      website: s.url,
      oneLiner: s.title,
      founders: [],
      teamSignal: null,
      tractionSignal: {
        type: "hn",
        value: `${s.points} points, ${s.num_comments} comments`,
        sourceUrl: url,
        date: s.created_at || null,
      },
      sourceUrls: [url],
    };
  });
}
