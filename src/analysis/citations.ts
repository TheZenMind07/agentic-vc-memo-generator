import type { Analysis } from "../types";

const LINK_RE = /\]\(https?:\/\/[^)]+\)/i;
const INFERRED_RE = /\[inferred\]/i;
const UNCITED = " [uncited]";

/**
 * A claim-bearing string is satisfied when it contains either an inline
 * markdown citation link ([source](URL)) or an "[inferred]" reasoning tag.
 */
export function isCited(text: string): boolean {
  return LINK_RE.test(text) || INFERRED_RE.test(text);
}

/** Append the "[uncited]" marker to a string that carries no citation. */
export function markUncited(text: string): string {
  return `${text}${UNCITED}`;
}

/**
 * Enforce the citation rule on an analysis: every claim-bearing string that
 * has neither an inline link nor an "[inferred]" tag gets a trailing
 * "[uncited]" marker so the gap is visible in the memo and greppable in the
 * JSON. Null fields are skipped. Returns a new analysis object.
 */
export function checkCitations(analysis: Analysis): Analysis {
  const enforce = (s: string | null): string | null => {
    if (s === null) return null;
    return isCited(s) ? s : markUncited(s);
  };

  return {
    ...analysis,
    team: {
      ...analysis.team,
      summary: enforce(analysis.team.summary)!,
      founders: analysis.team.founders.map((f) => ({
        ...f,
        background: enforce(f.background),
      })),
      technicalDepth: enforce(analysis.team.technicalDepth),
    },
    product: {
      ...analysis.product,
      plainLanguage: enforce(analysis.product.plainLanguage)!,
      category: enforce(analysis.product.category),
    },
    market: {
      ...analysis.market,
      sizeHint: enforce(analysis.market.sizeHint),
      competitiveLandscape: enforce(analysis.market.competitiveLandscape),
      whyNow: enforce(analysis.market.whyNow),
    },
    risks: analysis.risks.map((r) => ({ ...r, text: enforce(r.text)! })),
    scoreRationale: enforce(analysis.scoreRationale)!,
  };
}
