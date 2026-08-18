import { z } from "zod";
import type { Candidate } from "../types";
import type { LlmClient } from "../llm/client";
import { discoverTopic as discoverTopicMessages } from "../llm/prompts";
import { discoveredCandidateSchema, withId } from "./common";

/** Topic mode: discover candidates via web search (search model). */
export async function discoverTopic(client: LlmClient, query: string, targetCount: number): Promise<Candidate[]> {
  const list = await client.searchJson(z.array(discoveredCandidateSchema), discoverTopicMessages(query, targetCount));
  return list.slice(0, targetCount).map(withId);
}
