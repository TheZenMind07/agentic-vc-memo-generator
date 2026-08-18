import { z } from "zod";

// --- Sourcing ---------------------------------------------------------------

export const tractionSignalSchema = z.object({
  type: z.enum(["launch", "funding", "hn", "github", "other"]),
  value: z.string(),
  sourceUrl: z.string(),
  date: z.string().nullable(),
});

export const candidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  website: z.string().nullable(),
  oneLiner: z.string().nullable(),
  founders: z.array(z.string()),
  teamSignal: z.string().nullable(),
  tractionSignal: tractionSignalSchema.nullable(),
  sourceUrls: z.array(z.string()),
});

// --- Rubric / thesis --------------------------------------------------------

export const rubricCriterionSchema = z.object({
  key: z.string(),
  label: z.string(),
  weight: z.number().min(0).max(1),
  successCriteria: z.array(z.string()),
  scale: z.number().int().positive().default(5),
});

export const rubricSchema = z.object({
  criteria: z.array(rubricCriterionSchema).min(1),
});

export const thesisSchema = z.object({
  source: z.enum(["prose", "rubric", "default"]),
  prose: z.string().optional(),
  rubric: rubricSchema.optional(),
});

// --- Source input -----------------------------------------------------------

export const sourceConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("topic"), query: z.string() }),
  z.object({ type: z.literal("urls"), urls: z.array(z.string()).min(1) }),
  z.object({
    type: z.literal("feed"),
    feed: z.enum(["yc", "producthunt", "hn"]),
    batch: z.string().optional(),
  }),
]);

// --- Config -----------------------------------------------------------------

export const trailSchema = z.object({
  enabled: z.boolean(),
  specs: z.object({ write: z.boolean(), perStage: z.boolean() }),
  journal: z.object({
    write: z.boolean(),
    level: z.enum(["minimal", "standard", "verbose"]),
    includePrompts: z.boolean(),
    includeFailures: z.boolean(),
    includeAttribution: z.boolean(),
  }),
  prompts: z.object({
    write: z.boolean(),
    includeTemplates: z.boolean(),
    includeRationale: z.boolean(),
  }),
  decisions: z.object({ write: z.boolean(), autoCapture: z.boolean() }),
  commits: z.enum(["atomic", "batched", "none"]),
});

export const llmConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKeyEnv: z.string(),
  searchModel: z.string(),
  model: z.string(),
});

export const analysisConfigSchema = z.object({
  model: z.string(),
  requireCitations: z.boolean(),
  rubric: rubricSchema,
});

export const runConfigSchema = z.object({
  source: sourceConfigSchema,
  thesis: thesisSchema,
  analysis: analysisConfigSchema,
  llm: llmConfigSchema,
  trail: trailSchema,
  sourcing: z.object({
    targetCandidates: z.number().int().min(10).max(20),
    limit: z.number().int().positive().optional(),
  }),
  output: z.object({ format: z.enum(["text", "json"]) }),
  concurrency: z.number().int().min(1).max(16).default(4),
});

// --- Analysis ---------------------------------------------------------------

export const founderSchema = z.object({
  name: z.string(),
  background: z.string().nullable(),
  priorExits: z.boolean().nullable(),
});

export const riskSchema = z.object({
  text: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
});

export const subScoreSchema = z.object({
  key: z.string(),
  label: z.string(),
  rating: z.number().min(0),
  scale: z.number().positive(),
  weight: z.number(),
  rationale: z.string(),
});

export const analysisSchema = z.object({
  candidateId: z.string(),
  team: z.object({
    summary: z.string(),
    founders: z.array(founderSchema),
    technicalDepth: z.string().nullable(),
    sourceUrls: z.array(z.string()),
  }),
  product: z.object({
    plainLanguage: z.string(),
    category: z.string().nullable(),
    sourceUrls: z.array(z.string()),
  }),
  market: z.object({
    sizeHint: z.string().nullable(),
    competitiveLandscape: z.string().nullable(),
    whyNow: z.string().nullable(),
    sourceUrls: z.array(z.string()),
  }),
  risks: z.array(riskSchema),
  score: z.number().min(0).max(100).nullable(),
  subScores: z.array(subScoreSchema),
  scoreRationale: z.string(),
});

// --- Recommendation ---------------------------------------------------------

export const verdictSchema = z.enum(["pass", "watch", "take_a_meeting"]);

export const memoSchema = z.object({
  candidateId: z.string(),
  verdict: verdictSchema,
  summary: z.string(),
  rationale: z.string(),
  changeMyMind: z.array(z.string()),
  score: z.number().min(0).max(100).nullable(),
});

// --- Inferred types ---------------------------------------------------------

export type TractionSignal = z.infer<typeof tractionSignalSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;
export type Rubric = z.infer<typeof rubricSchema>;
export type ThesisConfig = z.infer<typeof thesisSchema>;
export type SourceConfig = z.infer<typeof sourceConfigSchema>;
export type TrailConfig = z.infer<typeof trailSchema>;
export type LlmConfig = z.infer<typeof llmConfigSchema>;
export type AnalysisConfig = z.infer<typeof analysisConfigSchema>;
export type RunConfig = z.infer<typeof runConfigSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type Risk = z.infer<typeof riskSchema>;
export type SubScore = z.infer<typeof subScoreSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Memo = z.infer<typeof memoSchema>;
