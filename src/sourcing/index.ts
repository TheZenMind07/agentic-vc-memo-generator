import type { Candidate, RunConfig } from "../types";
import type { LlmClient } from "../llm/client";
import { discoverTopic } from "./discover-topic";
import { discoverUrls } from "./discover-urls";
import { discoverFeed } from "./discover-feed";
import { enrichCandidate } from "./enrich";
import { dedupe } from "./common";
import { mapWithConcurrency } from "../util";

/** Stage 1: discover candidates (per source mode) then enrich them. */
export async function runSourcing(client: LlmClient, config: RunConfig): Promise<Candidate[]> {
  const limit = config.sourcing.limit ?? config.sourcing.targetCandidates;
  const src = config.source;

  let candidates: Candidate[];
  if (src.type === "topic") {
    candidates = await discoverTopic(client, src.query, limit);
  } else if (src.type === "urls") {
    candidates = await discoverUrls(client, src.urls);
  } else {
    candidates = await discoverFeed(src.feed, src.batch);
  }

  const selected = dedupe(candidates).slice(0, limit);
  console.log(`[sourcing] discovered ${candidates.length}, analyzing ${selected.length}`);

  return mapWithConcurrency(selected, config.concurrency, async (c, i) => {
    console.log(`[sourcing] enriching ${i + 1}/${selected.length}: ${c.name}`);
    return enrichCandidate(client, c);
  });
}
