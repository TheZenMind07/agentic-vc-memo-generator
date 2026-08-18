# Spec — Stage 2: Analysis

## Purpose
For each candidate, produce a structured analysis covering Team, Product, Market,
Risks/open questions, and a 0–100 Score measured against the thesis-derived rubric.

## Inputs
- Candidate (from Stage 1).
- `analysis.rubric.criteria[]` (the thesis, machine-readable): `{ key, label, weight,
  successCriteria[], scale }`.
- `analysis.requireCitations` (default true).

## Scoring
Score is derived from the rubric, not a free-form "good company" number:

```
score = round( Σ( weight_i × rating_i / scale_i ) × 100 ),  0..100
```

- `rating_i` is the LLM's integer rating (0..scale) of criterion `i` against its
  `successCriteria`.
- Weights are normalized to sum 1.0 at config load (guard against drift).
- Sub-scores (per-criterion rating + rationale) are persisted so any score is
  spot-checkable.
- Risks/open questions are **output but not weighted** — they inform the verdict,
  not the score.

## Output schema (analysis)

```ts
{
  candidateId: string;
  team: {
    summary: string;
    founders: { name: string; background: string | null; priorExits: boolean | null }[];
    technicalDepth: string | null;
    sourceUrls: string[];
  };
  product: {
    plainLanguage: string;      // what it does, in plain language
    category: string | null;    // copilot vs agent, horizontal vs vertical
    sourceUrls: string[];
  };
  market: {
    sizeHint: string | null;
    competitiveLandscape: string | null;
    whyNow: string | null;
    sourceUrls: string[];
  };
  risks: { text: string; severity: 'low' | 'medium' | 'high' | 'critical' }[];
  score: number | null;         // null when insufficient data
  subScores: {
    key: string;
    label: string;
    rating: number;             // 0..scale
    scale: number;
    weight: number;
    rationale: string;
  }[];
  scoreRationale: string;
}
```

## Citation rule (anti-pattern guard)
Every claim carries a `sourceUrl`; a claim with no source is marked `inferred`
(prefix the text with `[inferred]`) rather than presented as fact. When data is
missing, the field is `null`, never invented.

## Degraded behavior
- LLM returns invalid JSON -> zod validation fails -> retry with error (max N).
- Still invalid -> mark analysis degraded: `score = null`, summaries set to a
  `dataUnavailable` note. The run must not crash.

## Acceptance criteria
- Score is a deterministic function of sub-scores (recomputable).
- Per-criterion sub-scores + rationale are stored.
- A reviewer can trace any claim to a `sourceUrl` or an `[inferred]` tag.
