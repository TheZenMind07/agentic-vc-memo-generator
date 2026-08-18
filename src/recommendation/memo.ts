import { z } from "zod";
import type { Analysis, Candidate, Memo, Risk, RunConfig, Verdict } from "../types";
import type { LlmClient } from "../llm/client";
import { recommend as recommendMessages, thesisText } from "../llm/prompts";

export const VERDICT_LABEL: Record<Verdict, string> = {
  pass: "Pass",
  watch: "Watch",
  take_a_meeting: "Take a meeting",
};

const llmMemoSchema = z.object({
  verdict: z.enum(["pass", "watch", "take_a_meeting"]),
  summary: z.string(),
  rationale: z.string(),
  changeMyMind: z.array(z.string()).default([]),
});

/** Deterministic verdict from score + risk severity (spec §3). */
export function verdictFor(score: number | null, risks: Risk[]): Verdict {
  if (score === null) return "pass";
  const hasCritical = risks.some((r) => r.severity === "critical");
  if (score >= 70 && !hasCritical) return "take_a_meeting";
  if (score >= 50) return "watch";
  return "pass";
}

export function verdictRuleText(): string {
  return (
    "score >= 70 and no critical risk -> take_a_meeting; " +
    "score >= 70 with critical risk -> watch; " +
    "score >= 50 -> watch; " +
    "score < 50 -> pass; " +
    "null score -> pass (insufficient data)"
  );
}

function ensureChangeMyMind(items: string[], verdict: Verdict): string[] {
  const out = items.filter((s) => s.trim()).slice(0, 3);
  const defaults: Record<Verdict, string> = {
    pass: "Signals of a live, paying customer base",
    watch: "Evidence the core thesis criterion strengthens (team/moat/traction)",
    take_a_meeting: "Validation of the 'why now' driver and a first reference customer",
  };
  while (out.length < 2) out.push(defaults[verdict]);
  return out;
}

/** Stage 3: produce a memo; the rule-constrained verdict always wins. */
export async function runRecommendation(
  client: LlmClient,
  config: RunConfig,
  candidate: Candidate,
  analysis: Analysis,
): Promise<Memo> {
  const baseVerdict = verdictFor(analysis.score, analysis.risks);
  const rubric = config.analysis.rubric;
  const raw = await client.json(
    llmMemoSchema,
    recommendMessages(candidate, analysis.score, verdictRuleText(), rubric),
    { model: config.analysis.model },
  );

  const verdict = raw.verdict === baseVerdict ? raw.verdict : baseVerdict;
  return {
    candidateId: candidate.id,
    verdict,
    summary: raw.summary,
    rationale: raw.rationale,
    changeMyMind: ensureChangeMyMind(raw.changeMyMind, verdict),
    score: analysis.score,
  };
}

/** Collect the unique source URLs cited across all analysis sections. */
export function collectSources(analysis: Analysis): string[] {
  const seen = new Set<string>();
  for (const url of [
    ...analysis.team.sourceUrls,
    ...analysis.product.sourceUrls,
    ...analysis.market.sourceUrls,
  ]) {
    const u = url.trim();
    if (u && !seen.has(u)) seen.add(u);
  }
  return [...seen];
}

/** Render a one-page markdown memo. */
export function renderMemo(candidate: Candidate, analysis: Analysis, memo: Memo): string {
  const score = memo.score === null ? "n/a" : `${memo.score}/100`;
  const website = candidate.website ?? "no website";
  const lines: string[] = [
    `# ${candidate.name}`,
    "",
    `${website} | score ${score} | **${VERDICT_LABEL[memo.verdict]}**`,
    "",
    memo.summary,
    "",
    "## What they do",
    analysis.product.plainLanguage,
    "",
    "## Team",
    analysis.team.summary,
  ];

  if (analysis.team.technicalDepth) {
    lines.push("", `Technical depth: ${analysis.team.technicalDepth}`);
  }

  const marketBits = [analysis.market.sizeHint, analysis.market.whyNow].filter(Boolean);
  if (marketBits.length > 0) {
    lines.push("", "## Market", marketBits.join(" / "));
  }
  if (analysis.market.competitiveLandscape) {
    lines.push(`Competitive landscape: ${analysis.market.competitiveLandscape}`);
  }

  if (analysis.risks.length > 0) {
    lines.push("", "## Risks");
    for (const r of analysis.risks) lines.push(`- ${r.text} (${r.severity})`);
  }

  lines.push(
    "",
    `## Why ${VERDICT_LABEL[memo.verdict]}`,
    memo.rationale,
    "",
    "## What would change my mind",
  );
  for (const t of memo.changeMyMind) lines.push(`- ${t}`);

  const sources = collectSources(analysis);
  if (sources.length > 0) {
    lines.push("", "## Sources");
    for (const s of sources) lines.push(`- [${s}](${s})`);
  }

  lines.push("", "---");
  return lines.join("\n");
}
