# Prompt Design

The exact prompt templates used by the LLM stages, with rationale. Kept here so a
reviewer can see what the model was actually asked and why.

## Shared conventions
- Ask for **JSON only**, with an explicit schema hint, because non-OpenAI models on
  OpenRouter have no strict JSON mode.
- Always include "if you don't know, say `unknown`/`null` — never invent" to stop
  hallucination (anti-pattern: unsourced claims).
- Every factual claim must carry a `sourceUrl`, else prefix with `[inferred]`.

## 1. Sourcing — discovery (topic mode)
`prompts.discoverTopic(query, targetCount)`

```
You are a startup-sourcing analyst. Find {targetCount} startups matching:
"{query}".

For each, return JSON only, a JSON array with fields:
name, website, oneLiner, founders (array of strings, may be empty),
tractionSignal ({type, value, sourceUrl, date} or null).

Use web search. Prefer recent, real companies with a website. If a field is not
findable, use null or [] — never invent. Cite the source URL where you found it.
```

Rationale: bounded list, explicit nulls, source-citation requirement mirrors the
rubric's traceability rule.

## 2. Sourcing — enrichment (news/founders)
`prompts.enrichCandidate(name, website)`

```
Given startup "{name}" ({website}), find public signals:
- funding rounds or recent launch (amount, date, source URL)
- founder names and backgrounds (prior startups/exits, technical depth)

Return JSON: { funding: {value, sourceUrl, date} | null,
  founders: [{name, background|null}], teamSignal: string|null }.
Use web search. Unknown -> null, never invent.
```

## 3. Analysis
`prompts.analyzeCandidate(candidate, rubric, thesis)`

```
Analyze this startup against our thesis. Thesis: {thesis}.

Scoring rubric (rate each 0..{scale} against its successCriteria):
{criteria block}

Return JSON only matching:
{
  team: {summary, founders:[{name,background,priorExits}], technicalDepth, sourceUrls},
  product: {plainLanguage, category, sourceUrls},
  market: {sizeHint, competitiveLandscape, whyNow, sourceUrls},
  risks: [{text, severity}],
  subScores: [{key, label, rating, scale, weight, rationale}],
  scoreRationale
}
Rules: score = derived from subScores (do not freehand). Cite sources; use
"[inferred]" when reasoning without a source; null when unknown.
```

Rationale: the rubric is injected verbatim so scoring follows the thesis; sub-scores
are returned so the final 0–100 is recomputable and defensible.

## 4. Recommendation
`prompts.recommend(candidate, analysis, verdictRule)`

```
Write a one-page investment memo for "{name}".
Verdict rule: {verdictRule}. Your verdict MUST match the rule.
Return JSON: { verdict, summary, rationale, changeMyMind: [2-3 concrete triggers] }.
Tie rationale to the thesis and the score {score}. changeMyMind = specific signals
that would change the call (e.g. "first 10 paying customers", "hires a sales leader").
```

Rationale: verdict is rule-constrained (consistency), but the model supplies the
human-readable reasoning and the "what would change my mind" triggers.

## Retry / repair (all stages)
`prompts.repair(originalPrompt, badOutput, zodErrors)`

```
Your previous response failed schema validation:
{zodErrors}
Return ONLY corrected JSON matching the requested schema. Do not change any facts
you were confident about; fix only the structural errors.
```
