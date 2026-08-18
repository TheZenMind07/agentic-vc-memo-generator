import type { Rubric, SubScore } from "./types";

/**
 * Normalize criterion weights so they sum to exactly 1.0. Guards against a
 * user-supplied rubric whose weights drift (spec: "weights normalized to 1.0").
 */
export function normalizeRubric(rubric: Rubric): Rubric {
  const sum = rubric.criteria.reduce((acc, c) => acc + c.weight, 0);
  if (sum === 0) {
    throw new Error("Rubric weights sum to zero");
  }
  if (Math.abs(sum - 1) < 1e-9) return rubric;
  return {
    criteria: rubric.criteria.map((c) => ({ ...c, weight: c.weight / sum })),
  };
}

/**
 * Recompute the 0-100 score from per-criterion sub-scores (not the LLM's
 * freehand number), so any score is defensible and reproducible.
 */
export function computeScore(subScores: SubScore[]): number {
  if (subScores.length === 0) return 0;
  const total = subScores.reduce((acc, s) => {
    const scale = s.scale > 0 ? s.scale : 1;
    return acc + s.weight * (s.rating / scale);
  }, 0);
  return Math.max(0, Math.min(100, Math.round(total * 100)));
}
