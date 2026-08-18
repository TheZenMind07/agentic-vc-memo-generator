import { describe, expect, it } from "vitest";
import { checkCitations, isCited, markUncited } from "../src/analysis/citations";
import { collectSources } from "../src/recommendation/memo";
import type { Analysis } from "../src/types";

function baseAnalysis(): Analysis {
  return {
    candidateId: "acme",
    team: { summary: "t", founders: [], technicalDepth: null, sourceUrls: ["https://team.example"] },
    product: { plainLanguage: "p", category: null, sourceUrls: [] },
    market: { sizeHint: null, competitiveLandscape: null, whyNow: null, sourceUrls: [] },
    risks: [],
    score: 60,
    subScores: [],
    scoreRationale: "r",
  };
}

describe("isCited", () => {
  it("accepts inline markdown links", () => {
    expect(isCited("Raised $10M [source](https://x.com)")).toBe(true);
  });

  it("accepts the inferred tag", () => {
    expect(isCited("[inferred] likely early stage")).toBe(true);
  });

  it("rejects bare claims", () => {
    expect(isCited("Raised $10M")).toBe(false);
  });
});

describe("checkCitations", () => {
  it("marks uncited claim strings", () => {
    const out = checkCitations(baseAnalysis());
    expect(out.team.summary).toBe("t [uncited]");
    expect(out.product.plainLanguage).toBe("p [uncited]");
    expect(out.scoreRationale).toBe("r [uncited]");
  });

  it("leaves cited and null fields untouched", () => {
    const a = baseAnalysis();
    a.team.summary = "Backed by a16z [source](https://a16z.com/x)";
    a.market.whyNow = "[inferred] cost collapse";
    const out = checkCitations(a);
    expect(out.team.summary).toBe("Backed by a16z [source](https://a16z.com/x)");
    expect(out.market.whyNow).toBe("[inferred] cost collapse");
    expect(out.market.sizeHint).toBeNull();
    expect(out.team.technicalDepth).toBeNull();
  });

  it("marks founder backgrounds and risk text", () => {
    const a = baseAnalysis();
    a.team.founders = [{ name: "Jane", background: "ex-Google", priorExits: false }];
    a.risks = [{ text: "No moat", severity: "high" }];
    const out = checkCitations(a);
    expect(out.team.founders[0]?.background).toBe("ex-Google [uncited]");
    expect(out.risks[0]?.text).toBe("No moat [uncited]");
  });
});

describe("collectSources", () => {
  it("dedupes source urls across sections in order", () => {
    const a = baseAnalysis();
    a.team.sourceUrls = ["https://team.example", "https://team.example"];
    a.product.sourceUrls = ["https://product.example"];
    a.market.sourceUrls = ["https://team.example", " https://market.example "];
    expect(collectSources(a)).toEqual([
      "https://team.example",
      "https://product.example",
      "https://market.example",
    ]);
  });

  it("returns empty when no sources", () => {
    const a = baseAnalysis();
    a.team.sourceUrls = [];
    expect(collectSources(a)).toEqual([]);
  });
});

describe("markUncited", () => {
  it("appends the uncited marker", () => {
    expect(markUncited("x")).toBe("x [uncited]");
  });
});
