import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { RunConfig, Rubric } from "./types";
import { runConfigSchema } from "./types";
import { normalizeRubric } from "./scoring";

export const DEFAULT_RUBRIC: Rubric = {
  criteria: [
    {
      key: "team",
      label: "Team",
      weight: 0.3,
      successCriteria: [
        "Founder-market fit for the stated vertical",
        "Technical depth to own the core model/integration layer in-house",
        "Prior startup/exit or domain operating experience",
      ],
      scale: 5,
    },
    {
      key: "moat",
      label: "Defensibility",
      weight: 0.25,
      successCriteria: [
        "Proprietary data or workflow lock-in in a specific vertical",
        "Switching costs or network effects, not just a thin LLM wrapper",
        "No dependence on a single horizontal platform for differentiation",
      ],
      scale: 5,
    },
    {
      key: "product",
      label: "Product",
      weight: 0.2,
      successCriteria: [
        "AI-native agent (takes an action end-to-end), not a copilot",
        "Self-serve onboarding for SMBs (no heavy sales/implementation)",
        "Clearly articulates what it does in one sentence",
      ],
      scale: 5,
    },
    {
      key: "market",
      label: "Market & Why-Now",
      weight: 0.15,
      successCriteria: [
        "Specific vertical with a credible size hint",
        "Why-now driver (LLM cost collapse, vertical data availability, new API)",
        "Identifiable competitors and a stated wedge",
      ],
      scale: 5,
    },
    {
      key: "traction",
      label: "Traction / Freshness",
      weight: 0.1,
      successCriteria: [
        "Live signal: paying customers, active usage, funding, launch, HN/GitHub activity",
        "Signal is recent (freshness), not stale",
      ],
      scale: 5,
    },
  ],
};

export function defaultConfig(): RunConfig {
  const model = "nvidia/nemotron-3-ultra-550b-a55b:free";
  return {
    source: { type: "feed", feed: "yc" },
    thesis: { source: "default" },
    analysis: {
      model,
      requireCitations: true,
      rubric: DEFAULT_RUBRIC,
    },
    llm: {
      baseUrl: "https://openrouter.ai/api/v1",
      apiKeyEnv: "OPENROUTER_API_KEY",
      searchModel: "perplexity/sonar",
      model,
    },
    trail: {
      enabled: true,
      specs: { write: true, perStage: true },
      journal: {
        write: true,
        level: "standard",
        includePrompts: true,
        includeFailures: true,
        includeAttribution: true,
      },
      prompts: { write: true, includeTemplates: true, includeRationale: true },
      decisions: { write: true, autoCapture: true },
      commits: "atomic",
    },
    sourcing: { targetCandidates: 15 },
    output: { format: "text" },
    concurrency: 4,
  };
}

/**
 * Deep-set a dot-path (e.g. "trail.journal.level") on an object. Creates
 * intermediate objects as needed. Values already coerced by the caller.
 */
export function deepSet(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let node: Record<string, unknown> = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!;
    const existing = node[k];
    if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
      node[k] = {};
    }
    node = node[k] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]!] = value;
}

/** Deep-merge `source` into `target` (source wins). Arrays and scalars replace. */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(source)) {
    const existing = out[k];
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      existing !== null &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      out[k] = deepMerge(existing as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function loadConfigFile(configPath?: string): Record<string, unknown> | null {
  const p = configPath ? path.resolve(configPath) : path.resolve(process.cwd(), "pipeline.config.json");
  if (!fs.existsSync(p)) return null;
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return raw as Record<string, unknown>;
}

/**
 * Resolve the final run config: defaults <- pipeline.config.json <- CLI
 * overrides, then validate + normalize rubric weights.
 *
 * `source` (when provided) replaces the source block wholesale rather than
 * deep-merging, because the three source modes are mutually exclusive.
 */
export function resolveConfig(
  cliOverrides: Record<string, unknown>,
  configPath?: string,
  source?: RunConfig["source"],
): RunConfig {
  let merged: Record<string, unknown> = defaultConfig() as unknown as Record<string, unknown>;
  const file = loadConfigFile(configPath);
  if (file) merged = deepMerge(merged, file);
  merged = deepMerge(merged, cliOverrides);
  if (source) merged.source = source;

  const parsed = runConfigSchema.parse(merged);
  parsed.analysis.rubric = normalizeRubric(parsed.analysis.rubric);
  return parsed;
}
