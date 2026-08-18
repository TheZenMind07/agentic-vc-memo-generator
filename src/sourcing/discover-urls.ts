import { z } from "zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Candidate } from "../types";
import type { LlmClient } from "../llm/client";
import { fetchText, htmlToText } from "../web/fetch";
import { discoveredCandidateSchema, withId } from "./common";

/** URLs mode: fetch each URL and extract candidate startups from the pages. */
export async function discoverUrls(client: LlmClient, urls: string[]): Promise<Candidate[]> {
  const pages: Array<{ url: string; text: string }> = [];
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      pages.push({ url, text: htmlToText(html) });
    } catch (err) {
      console.warn(`[sourcing] skipping ${url}: ${(err as Error).message}`);
    }
  }
  if (pages.length === 0) {
    throw new Error("No URLs could be fetched");
  }

  const pageBlock = pages
    .map((p) => `## ${p.url}\n${p.text}`)
    .join("\n\n");

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You extract candidate startups from web page text. Return ONLY a JSON array. " +
        "If a field is not findable, use null or [] — never invent facts.",
    },
    {
      role: "user",
      content:
        `Extract startups/companies mentioned in these pages:\n\n${pageBlock}\n\n` +
        `Return a JSON array of objects with exactly these fields:\n` +
        `{ "name": string, "website": string|null, "oneLiner": string|null, "founders": string[], ` +
        `"tractionSignal": { "type": "launch"|"funding"|"hn"|"github"|"other", "value": string, ` +
        `"sourceUrl": string, "date": string|null } | null, "sourceUrls": string[] }`,
    },
  ];

  const list = await client.json(z.array(discoveredCandidateSchema), messages);
  return list.map(withId);
}
