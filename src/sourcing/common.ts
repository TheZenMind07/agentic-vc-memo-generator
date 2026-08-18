import { z } from "zod";
import type { Candidate } from "../types";
import { tractionSignalSchema } from "../types";
import { slugify } from "../util";

/** Candidate as returned by the LLM (no `id`; assigned post-extraction). */
export const discoveredCandidateSchema = z.object({
  name: z.string(),
  website: z.string().nullable().default(null),
  oneLiner: z.string().nullable().default(null),
  founders: z.array(z.string()).default([]),
  teamSignal: z.string().nullable().default(null),
  tractionSignal: tractionSignalSchema.nullable().default(null),
  sourceUrls: z.array(z.string()).default([]),
});

export type DiscoveredCandidate = z.infer<typeof discoveredCandidateSchema>;

export function withId(d: DiscoveredCandidate, index: number): Candidate {
  return {
    id: slugify(d.name) || `candidate-${index}`,
    ...d,
  };
}

/** De-duplicate candidates by id, keeping first occurrence. */
export function dedupe(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}
