# Spec — Stage 1: Sourcing

## Purpose
Turn a seed input (topic query, list of URLs, or a feed) into 10–20 candidate
startups, each carrying: name, website, one-line description, founders/team signal
(where findable), and at least one freshness/traction signal.

## Inputs

`source` config (one of three modes):

| mode    | field    | meaning                                          |
|---------|----------|--------------------------------------------------|
| `topic` | `query`  | e.g. "AI agents for SMBs" — discovery via search |
| `urls`  | `urls[]` | explicit list of URLs to fetch and extract from  |
| `feed`  | `feed`   | `yc` \| `producthunt` \| `hn` (optionally `batch`) |

## Pipeline (per mode)

### topic mode
1. Call `perplexity/sonar` with web search enabled, asking for a list of startups
   matching the query.
2. LLM extracts structured candidates from search results.

### urls mode
1. Fetch each URL (HTML -> text via `cheerio`).
2. LLM extracts candidate startups from the page(s).

### feed mode
1. Fetch the feed source:
   - `yc`: YC public companies directory/API, filtered by `batch` (e.g. W25).
   - `producthunt`: PH launch page(s).
   - `hn`: Hacker News (Algolia) stories matching a tag/query.
2. Map feed records to candidates (deterministic mapping, not LLM).

## Enrichment (common to all modes)

For each candidate, gather signals (best-effort, missing -> `unknown`):

| Signal | Source | What |
|--------|--------|------|
| Traction | HN Algolia (`hn.algolia.com/api/v1/search?query=<domain>`) | story count, points, recent date |
| Activity | GitHub public API (`api.github.com/search/repositories?q=<org/name>`) | stars, last-push |
| News/funding | `perplexity/sonar` web search | funding rounds, launch, press |
| Founders/team | `perplexity/sonar` web search | founder names/backgrounds |

## Output schema (candidate)

```ts
{
  id: string;                 // slug, stable within run
  name: string;
  website: string | null;     // null when not findable
  oneLiner: string | null;
  founders: string[];         // empty when unknown
  teamSignal: string | null;  // free-text founder/team signal, or null
  tractionSignal: {
    type: 'launch' | 'funding' | 'hn' | 'github' | 'other';
    value: string;
    sourceUrl: string;
    date: string | null;
  } | null;
  sourceUrls: string[];       // where the candidate was found
}
```

## Rules
- Never hallucinate: any field not backed by a source is `null`/`[]`, never fabricated.
- Cap at `targetCandidates` (default 15, allowed 10–20). `--limit N` overrides for
  small runs.
- Idempotent: enrichment caches raw fetches under `outputs/<run-id>/.cache/`.

## Acceptance criteria
- Given a seed, produces 10–20 candidates matching the schema.
- Every non-null `tractionSignal` has a real `sourceUrl`.
- Feed mode is deterministic (same feed -> same candidates).
