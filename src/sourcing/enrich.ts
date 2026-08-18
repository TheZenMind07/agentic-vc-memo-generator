import { z } from "zod";
import type { Candidate } from "../types";
import type { LlmClient } from "../llm/client";
import { enrichCandidate as enrichMessages } from "../llm/prompts";
import { searchHn } from "../web/hn";

const enrichResultSchema = z.object({
  funding: z
    .object({
      value: z.string(),
      sourceUrl: z.string(),
      date: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
  founders: z.array(z.object({ name: z.string(), background: z.string().nullable().default(null) })).default([]),
  teamSignal: z.string().nullable().default(null),
});

/**
 * Best-effort enrichment: founders/team + funding via web search, with an HN
 * traction fallback when the candidate lacks any traction signal. Enrichment
 * never mutates existing signals and never fails the run.
 */
export async function enrichCandidate(client: LlmClient, c: Candidate): Promise<Candidate> {
  let founders = [...c.founders];
  let teamSignal = c.teamSignal;
  let tractionSignal = c.tractionSignal;

  try {
    const r = await client.searchJson(enrichResultSchema, enrichMessages(c.name, c.website));
    if (r.founders.length > 0) {
      founders = r.founders.map((f) => f.name);
      const backgrounds = r.founders.filter((f) => f.background).map((f) => `${f.name}: ${f.background}`);
      if (backgrounds.length > 0 && !teamSignal) teamSignal = backgrounds.join("; ");
    }
    if (r.teamSignal && !teamSignal) teamSignal = r.teamSignal;
    if (r.funding && !tractionSignal) {
      tractionSignal = { type: "funding", value: r.funding.value, sourceUrl: r.funding.sourceUrl, date: r.funding.date };
    }
  } catch (err) {
    console.warn(`[sourcing] enrichment (search) failed for ${c.name}: ${(err as Error).message}`);
  }

  if (!tractionSignal) {
    try {
      const stories = await searchHn(c.name, 3);
      const top = stories[0];
      if (top) {
        tractionSignal = {
          type: "hn",
          value: `${top.points} points, ${top.num_comments} comments`,
          sourceUrl: top.url ?? `https://news.ycombinator.com/item?id=${top.objectID}`,
          date: top.created_at || null,
        };
      }
    } catch (err) {
      console.warn(`[sourcing] enrichment (hn) failed for ${c.name}: ${(err as Error).message}`);
    }
  }

  return { ...c, founders, teamSignal, tractionSignal };
}
