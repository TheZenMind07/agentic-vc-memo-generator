# Decisions

Scoping calls and tradeoffs, in order. Each entry is an ADR-style record: context,
decision, rejected alternatives.

## D1. Language: TypeScript/Node over Python
User preference. Node 22 gives global `fetch`, `tsx` gives zero-build execution. The
OpenAI SDK's JS client points cleanly at OpenRouter. Rejected: Python (faster to
prototype LLM calls, but not the requested stack).

## D2. LLM provider: OpenRouter (not OpenAI direct)
OpenAI-compatible base URL + free-model tier. Discovery uses `perplexity/sonar`
(real web search, ~$1/M) because OpenRouter's free models have **no web-search
capability** and `gpt-4o-search-preview` is OpenAI-only. Analysis/memos use
`nvidia/nemotron-3-ultra-550b-a55b:free`. Rejected: OpenAI direct (needs paid key,
no free tier); DuckDuckGo scraping (free but brittle, lower signal quality).

## D3. No strict JSON mode
OpenRouter non-OpenAI models don't reliably support `response_format: json_schema`.
Chosen: prompt-for-JSON + `zod` validation + retry-with-error. This is provider-
agnostic and also gives us a retry path for malformed output.

## D4. Thesis is config, rubric derived from it
The assignment requires a "specific, defensible thesis" and scores "against your
stated thesis". Chosen: thesis is a first-class config (`prose` -> derived `rubric`
-> `criteria` with weights + successCriteria), frozen per run. This makes scores
recomputable and prevents the "thesis so broad the score is meaningless" anti-pattern.
Rejected: hardcoded scoring weights; free-form scores.

## D5. Risks not weighted into score
Risks/open questions are an analysis *output* that inform the verdict, not a score
criterion — so a high score with a critical risk reads honestly. Score = weighted
sum over team/moat/product/market/traction.

## D6. Verdict is rule-constrained, LLM-argued
Deterministic Pass/Watch/Take-a-meeting table over score + risk severity; the LLM
writes the rationale but can't override the rule. Ensures defensibility and
testability. Rejected: free LLM verdict (inconsistent, hard to spot-check).

## D7. No job queue / vector DB / frontend
Explicitly out of scope per constraints. JSON files are the "database"; stages are
resumable and cache raw responses. Rejected: any infra that isn't a single CLI run.

## D8. Process trail is configurable
The 40% "process visibility" dimension becomes a `trail` config schema (specs,
journal, prompts, decisions, commit policy) rather than hardcoded docs. Only what's
configured is emitted; resolved settings stamped into `run-config.json`.
