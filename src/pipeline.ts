import type { Memo, Rubric, RunConfig } from "./types";
import { rubricSchema } from "./types";
import { LlmClient } from "./llm/client";
import type { LlmClient as LlmClientType } from "./llm/client";
import { deriveRubricFromProse } from "./llm/prompts";
import { normalizeRubric } from "./scoring";
import { mapWithConcurrency } from "./util";
import { runSourcing } from "./sourcing";
import { runAnalysis, degradedAnalysis } from "./analysis";
import { runRecommendation, renderMemo } from "./recommendation/memo";
import {
  createRunDirs,
  writeRunConfig,
  writeThesis,
  writeCandidates,
  writeAnalysis,
  writeMemo,
  writeIndex,
  printResults,
  type RunResult,
} from "./output/writer";

/**
 * Resolve the thesis -> rubric before analysis. `prose` derives a rubric via the
 * model; `rubric` uses the supplied criteria; `default` keeps the built-in rubric.
 */
async function resolveThesis(client: LlmClientType, config: RunConfig): Promise<{ prose: string | null; rubric: Rubric }> {
  const t = config.thesis;
  if (t.source === "rubric" && t.rubric) {
    config.analysis.rubric = normalizeRubric(t.rubric);
    return { prose: t.prose ?? null, rubric: config.analysis.rubric };
  }
  if (t.source === "prose" && t.prose) {
    const rubric = await client.json(rubricSchema, deriveRubricFromProse(t.prose), {
      model: config.analysis.model,
    });
    config.analysis.rubric = normalizeRubric(rubric);
    return { prose: t.prose, rubric: config.analysis.rubric };
  }
  return { prose: null, rubric: config.analysis.rubric };
}

function fallbackMemo(candidateId: string, score: number | null, error: string): Memo {
  return {
    candidateId,
    verdict: "pass",
    summary: "Unable to produce a recommendation (model failure).",
    rationale: `Recommendation failed: ${error}`,
    changeMyMind: ["Any usable analysis data", "A successful re-run of the analysis stage"],
    score,
  };
}

/** Orchestrates the three stages: sourcing -> analysis -> recommendation. */
export async function runPipeline(config: RunConfig): Promise<void> {
  const client = new LlmClient(config.llm);
  const dirs = createRunDirs();
  console.log(`[pipeline] run dir: ${dirs.root}`);

  const { prose, rubric } = await resolveThesis(client, config);
  writeRunConfig(dirs, config);
  writeThesis(dirs, prose, rubric);

  const candidates = await runSourcing(client, config);
  writeCandidates(dirs, candidates);

  const results: RunResult[] = await mapWithConcurrency(
    candidates,
    config.concurrency,
    async (candidate, i): Promise<RunResult> => {
      console.log(`\n[pipeline] analyzing ${i + 1}/${candidates.length}: ${candidate.name}`);

      let analysis;
      try {
        analysis = await runAnalysis(client, config, candidate);
      } catch (err) {
        console.warn(`[pipeline] analysis failed for ${candidate.name}: ${(err as Error).message}`);
        analysis = degradedAnalysis(candidate.id);
      }
      writeAnalysis(dirs, analysis);

      let memo: Memo;
      try {
        memo = await runRecommendation(client, config, candidate, analysis);
      } catch (err) {
        console.warn(`[pipeline] recommendation failed for ${candidate.name}: ${(err as Error).message}`);
        memo = fallbackMemo(candidate.id, analysis.score, (err as Error).message);
      }
      writeMemo(dirs, renderMemo(candidate, analysis, memo), memo);

      return { candidate, analysis, memo };
    },
  );

  writeIndex(dirs, results);
  console.log(`\n[pipeline] wrote ${results.length} memos to ${dirs.root}`);
  printResults(results, config.output.format);
}
