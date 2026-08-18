import { describe, expect, it } from "vitest";
import { computeScore, normalizeRubric } from "../src/scoring";
import type { Rubric, SubScore } from "../src/types";

function sub(key: string, rating: number, scale = 5, weight = 0.2): SubScore {
  return { key, label: key, rating, scale, weight, rationale: "t" };
}

describe("normalizeRubric", () => {
  it("leaves weights already summing to 1.0 unchanged", () => {
    const rubric: Rubric = {
      criteria: [
        { key: "a", label: "A", weight: 0.5, successCriteria: [], scale: 5 },
        { key: "b", label: "B", weight: 0.5, successCriteria: [], scale: 5 },
      ],
    };
    expect(normalizeRubric(rubric)).toEqual(rubric);
  });

  it("normalizes weights that do not sum to 1.0", () => {
    const rubric: Rubric = {
      criteria: [
        { key: "a", label: "A", weight: 1, successCriteria: [], scale: 5 },
        { key: "b", label: "B", weight: 1, successCriteria: [], scale: 5 },
      ],
    };
    const out = normalizeRubric(rubric);
    expect(out.criteria.map((c) => c.weight)).toEqual([0.5, 0.5]);
  });

  it("throws on zero total weight", () => {
    const rubric: Rubric = {
      criteria: [{ key: "a", label: "A", weight: 0, successCriteria: [], scale: 5 }],
    };
    expect(() => normalizeRubric(rubric)).toThrow();
  });
});

describe("computeScore", () => {
  it("computes weighted score scaled to 0-100", () => {
    const subs = [
      sub("team", 5, 5, 0.5),
      sub("moat", 0, 5, 0.5),
    ];
    expect(computeScore(subs)).toBe(50);
  });

  it("handles full score", () => {
    expect(computeScore([sub("a", 5, 5, 1)])).toBe(100);
  });

  it("returns 0 for empty sub-scores", () => {
    expect(computeScore([])).toBe(0);
  });

  it("clamps to 0-100", () => {
    expect(computeScore([sub("a", 99, 5, 1)])).toBe(100);
  });
});
