import { describe, expect, it } from "vitest";
import { renderMemo, verdictFor, VERDICT_LABEL } from "../src/recommendation/memo";
import type { Analysis, Candidate, Memo, Risk } from "../src/types";

const candidate: Candidate = {
  id: "acme",
  name: "Acme",
  website: "https://acme.com",
  oneLiner: "AI for SMBs",
  founders: [],
  teamSignal: null,
  tractionSignal: null,
  sourceUrls: [],
};

const analysis: Analysis = {
  candidateId: "acme",
  team: { summary: "Strong team", founders: [], technicalDepth: null, sourceUrls: [] },
  product: { plainLanguage: "Does the thing", category: null, sourceUrls: [] },
  market: { sizeHint: "Big", competitiveLandscape: "Crowded", whyNow: "LLM costs", sourceUrls: [] },
  risks: [{ text: "No moat", severity: "high" }],
  score: 60,
  subScores: [],
  scoreRationale: "ok",
};

const memo: Memo = {
  candidateId: "acme",
  verdict: "watch",
  summary: "Summary line",
  rationale: "Because.",
  changeMyMind: ["First 10 customers", "Hires a sales leader"],
  score: 60,
};

function risk(severity: Risk["severity"]): Risk {
  return { text: "r", severity };
}

describe("verdictFor", () => {
  it("passes on null score", () => {
    expect(verdictFor(null, [])).toBe("pass");
  });
  it("takes a meeting at >=70 with no critical risk", () => {
    expect(verdictFor(75, [risk("high")])).toBe("take_a_meeting");
  });
  it("downgrades to watch at >=70 with critical risk", () => {
    expect(verdictFor(75, [risk("critical")])).toBe("watch");
  });
  it("watches at >=50", () => {
    expect(verdictFor(60, [])).toBe("watch");
  });
  it("passes below 50", () => {
    expect(verdictFor(40, [])).toBe("pass");
  });
});

describe("renderMemo", () => {
  it("contains the required sections and verdict", () => {
    const text = renderMemo(candidate, analysis, memo);
    expect(text).toContain("# Acme");
    expect(text).toContain(VERDICT_LABEL.watch);
    expect(text).toContain("## What they do");
    expect(text).toContain("## Team");
    expect(text).toContain("## Market");
    expect(text).toContain("## Risks");
    expect(text).toContain("## What would change my mind");
    expect(text).toContain("- First 10 customers");
    expect(text).toContain("60/100");
  });

  it("renders n/a when score is null", () => {
    const text = renderMemo(candidate, { ...analysis, score: null }, { ...memo, score: null });
    expect(text).toContain("n/a");
  });
});
