import { z } from "zod";
import type { Analysis, Candidate, Risk, Rubric, RunConfig } from "../types";
import { founderSchema, riskSchema } from "../types";
import type { LlmClient } from "../llm/client";
import { analyzeCandidate as analyzeMessages, thesisText } from "../llm/prompts";
import { computeScore } from "../scoring";
import { checkCitations } from "./citations";

/** The JSON the LLM is asked to return (weights/keys enforced from config). */
const llmAnalysisSchema = z.object({
  team: z.object({
    summary: z.string(),
    founders: z.array(founderSchema).default([]),
    technicalDepth: z.string().nullable().default(null),
    sourceUrls: z.array(z.string()).default([]),
  }),
  product: z.object({
    plainLanguage: z.string(),
    category: z.string().nullable().default(null),
    sourceUrls: z.array(z.string()).default([]),
  }),
  market: z.object({
    sizeHint: z.string().nullable().default(null),
    competitiveLandscape: z.string().nullable().default(null),
    whyNow: z.string().nullable().default(null),
    sourceUrls: z.array(z.string()).default([]),
  }),
  risks: z.array(riskSchema).default([]),
  subScores: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        rating: z.number(),
        scale: z.number().positive(),
        rationale: z.string(),
      }),
    )
    .default([]),
  scoreRationale: z.string().default(""),
});

/** Merge LLM ratings with authoritative rubric weights/keys and compute score. */
function buildAnalysis(candidateId: string, llm: z.infer<typeof llmAnalysisSchema>, rubric: Rubric): Analysis {
  const subScores = rubric.criteria.map((c, index) => {
    const s = matchSubScore(llm.subScores, c, index);
    return {
      key: c.key,
      label: c.label,
      rating: s?.rating ?? 0,
      scale: c.scale,
      weight: c.weight,
      rationale: s?.rationale ?? "No rating provided by model",
    };
  });
  return {
    candidateId,
    team: llm.team,
    product: llm.product,
    market: llm.market,
    risks: llm.risks,
    score: computeScore(subScores),
    subScores,
    scoreRationale: llm.scoreRationale,
  };
}

/**
 * Match a model-produced sub-score to a rubric criterion, tolerating key/label
 * drift (e.g. the model writing "defensibility" for key "moat"). Falls back to
 * positional order as a last resort.
 */
function matchSubScore(
  subScores: Array<{ key: string; label: string; rating: number; scale: number; rationale: string }>,
  criterion: Rubric["criteria"][number],
  index: number,
): { rating: number; scale: number; rationale: string } | undefined {
  const norm = (s: string) => s.trim().toLowerCase();
  const byKey = subScores.find((s) => norm(s.key) === norm(criterion.key));
  if (byKey) return byKey;
  const byLabel = subScores.find((s) => norm(s.label) === norm(criterion.label));
  if (byLabel) return byLabel;
  return subScores[index];
}

/** Stage 2: analyze one candidate against the thesis-derived rubric. */
export async function runAnalysis(client: LlmClient, config: RunConfig, candidate: Candidate): Promise<Analysis> {
  const rubric = config.analysis.rubric;
  const thesis = config.thesis.prose ?? thesisText(rubric);
  const llm = await client.json(llmAnalysisSchema, analyzeMessages(candidate, rubric, thesis), {
    model: config.analysis.model,
  });
  const analysis = buildAnalysis(candidate.id, llm, rubric);
  if (config.analysis.requireCitations) return checkCitations(analysis);
  return analysis;
}

/** Degraded analysis for when the LLM fails or data is unusable. */
export function degradedAnalysis(candidateId: string): Analysis {
  return {
    candidateId,
    team: { summary: "Data unavailable", founders: [], technicalDepth: null, sourceUrls: [] },
    product: { plainLanguage: "Data unavailable", category: null, sourceUrls: [] },
    market: { sizeHint: null, competitiveLandscape: null, whyNow: null, sourceUrls: [] },
    risks: [],
    score: null,
    subScores: [],
    scoreRationale: "Analysis could not be produced (model failure or missing data).",
  };
}

export type { Risk };
