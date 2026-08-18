# Plan: AI-Augmented Investment Pipeline

## 1. Goal

A single-command pipeline that takes a seed input (topic query, list of URLs, or a
feed like YC W25) and outputs a one-page investment memo per startup, ending in
Pass / Watch / Take a meeting. Every claim traceable to a source.

## 2. Stack & Providers

| Concern          | Choice                                              |
|------------------|-----------------------------------------------------|
| Runtime          | TypeScript / Node 22, run via `tsx` (no build step) |
| LLM client       | OpenAI SDK -> OpenRouter (`https://openrouter.ai/api/v1`) |
| Discovery/search | `perplexity/sonar` (real web search, ~$1/M)          |
| Analysis + memo  | `nvidia/nemotron-3-ultra-550b-a55b:free` (default, configurable) |
| Validation       | `zod` + retry-with-error (no strict JSON mode)      |
| HTML parsing     | `cheerio`                                           |
| Env              | `dotenv` (`.env`, gitignored)                       |
| Tests            | `vitest`                                            |

## 3. Architecture / Data Flow

```
config/args -> 1. thesis -> 2. discovery -> 3. enrichment -> 4. analysis -> 5. memo -> outputs/<run-id>/
```

Each stage reads/writes versioned JSON artifacts; any stage is re-runnable alone.

## 4. Repo Layout

```
emergence/
├─ package.json  tsconfig.json  .env.example  .gitignore  README.md
├─ PROCESS.md                        # AI-workflow journal
├─ docs/
│  ├─ thesis.md                      # stated thesis + scoring criteria
│  ├─ spec-sourcing.md  spec-analysis.md  spec-recommendation.md
│  ├─ prompt-design.md               # prompt templates + rationale
│  └─ decisions.md                   # ADRs / scoping calls
├─ src/
│  ├─ cli.ts  config.ts  types.ts
│  ├─ llm/{client.ts,prompts.ts}
│  ├─ sourcing/{index.ts,discover-topic.ts,discover-urls.ts,discover-feed.ts,enrich.ts}
│  ├─ analysis/index.ts
│  ├─ recommendation/memo.ts
│  ├─ output/writer.ts
│  └─ web/{fetch.ts,hn.ts,github.ts}
├─ outputs/<run-id>/                 # committed outputs
└─ tests/
```

## 5. Stages

### 5.1 Sourcing
- Discovery adapters: `topic` (sonar search -> extract), `urls` (fetch + extract),
  `feed` (YC W25 / Product Hunt / HN via cheerio).
- Enrichment (common): HN Algolia (traction), GitHub (activity), sonar search
  (funding/launch/news + founders).
- Candidate schema: `{ id, name, website, oneLiner, founders[], teamSignal,
  tractionSignal{type,value,sourceUrl,date} }`; missing = `"unknown"`.

### 5.2 Analysis
- Structured JSON: Team / Product / Market / Risks / Score.
- Score = `Σ(weight_i × rating_i/scale) × 100` against the thesis-derived rubric.
- Every claim carries a `sourceUrl` or is marked `inferred`.

### 5.3 Recommendation
- One-page memo per startup -> Pass / Watch / Take a meeting + rationale +
  2-3 "what would change my mind" triggers.

## 6. Thesis & Rubric (configurable core)

- `thesis.source`: `prose` (detailed thesis -> auto-derived rubric) |
  `rubric` (direct JSON) | `default` (built-in so we can build/test now).
- `analysis.rubric.criteria[]`: `{ key, label, weight, successCriteria[], scale }`.
- Weights normalized to 1.0; sub-scores stored for spot-checking.
- `thesis.md` rendered from the same config (no drift).

Default rubric (derived from default thesis):
- team (0.30), moat (0.25), product (0.20), market (0.15), traction (0.10).

## 7. Output

- Default: readable one-pager per company to terminal.
- `--format json`: machine-readable stdout.
- Persisted to `outputs/<run-id>/`: `thesis.md`, `candidates.json`, `analyses/`,
  `memos/`, `index.md`, `run-config.json`.

## 8. Process Visibility (configurable `trail` schema)

- Toggles: `specs`, `journal`, `prompts`, `decisions`, `commits`.
- Only what's configured is emitted; stamped into `run-config.json`.
- Defaults on: docs-first specs, PROCESS.md journal (honest AI attribution),
  prompt-design.md, decisions.md, atomic commits.

## 9. Reliability

- Response caching, resumable stages, `--limit N` for small runs.

## 10. Phase-wise Breakdown

### Phase 0 — Scaffold
- `git init`; package.json, tsconfig, `.env.example`, `.gitignore` (covers `.env`,
  `node_modules`, `outputs/*/.cache`).
- Install deps: `openai`, `zod`, `cheerio`, `dotenv`; dev: `typescript`, `tsx`, `vitest`.
- **Test:** `npx tsc --noEmit` clean; `npm run pipeline --help` prints usage.

### Phase 1 — Docs & Specs (specs-first)
- Write `docs/spec-sourcing.md`, `spec-analysis.md`, `spec-recommendation.md`,
  `docs/thesis.md`, PROCESS.md skeleton, `docs/prompt-design.md`, `docs/decisions.md`.
- **Test:** specs agree with config schema; rubric weights sum to 1.0.

### Phase 2 — Core types, config, CLI, output
- `src/types.ts` (zod schemas: run config, trail, rubric, candidate, analysis, memo).
- `src/config.ts` (merge CLI > `pipeline.config.json` > defaults), `src/cli.ts` (args).
- `src/output/writer.ts` (run dirs, JSON/MD writers, index.md, caching).
- **Test (vitest):** config merge precedence; schema rejects bad rubric (weights,
  missing criteria); writer creates expected files.

### Phase 3 — LLM client
- `src/llm/client.ts` (OpenRouter baseURL, model selection, retry/backoff).
- JSON-with-zod-retry helper.
- **Test:** mocked OpenAI SDK — validates JSON, retries on zod failure, gives up
  after N; maps API errors to typed errors.

### Phase 4 — Sourcing
- `discover-topic.ts`, `discover-urls.ts`, `discover-feed.ts`, `enrich.ts`.
- `src/web/{fetch.ts,hn.ts,github.ts}`.
- **Test:** HN/GitHub response -> candidate mapping (fixtures); enrichment marks
  missing fields `"unknown"`; extraction normalizes URLs.

### Phase 5 — Analysis
- `src/analysis/index.ts` (rubric scoring, citations).
- **Test:** score formula correctness (0-100, weighted); per-criterion sub-scores
  persisted; claim w/o source flagged `inferred`.

### Phase 6 — Recommendation
- `src/recommendation/memo.ts` (verdict rules, markdown render).
- **Test:** memo renders all required sections; verdict derived from score+rules;
  change-my-mind triggers always present.

### Phase 7 — End-to-end run
- Run on demo seed; commit `outputs/<run-id>/`.
- **Test:** pipeline completes; memo readable in 60s; every analysis claim has a
  source or `inferred` tag.

### Phase 8 — README, final review
- README (run instructions, config reference, model/price notes).
- Final rubric self-check.

## 11. Testing Summary

| Layer         | Tool    | What                                                            |
|---------------|---------|-----------------------------------------------------------------|
| Unit          | vitest  | config merge, zod schemas, scoring math, memo render, parsers   |
| Integration   | vitest  | stage orchestration with mocked LLM + web (fixtures)            |
| Manual E2E    | CLI     | one full run on demo seed; spot-check sources in outputs/       |

## 12. Deliverables / Done

1. `npm run pipeline -- --source feed --input "YC 2025"` -> memos out.
2. Committed `outputs/` + docs/journal.
3. `git init`; add `chiragmakkar` & `hari@emsoft.com` as GitHub collaborators.

## 13. Demo Seed & Models

- **Demo seed:** YC 2025 (W25 + S25) — feed mode.
- **Discovery/search:** `perplexity/sonar`.
- **Analysis + memo:** `nvidia/nemotron-3-ultra-550b-a55b:free` (configurable).
- **Thesis:** default thesis for now; detailed thesis provided later into the
  `thesis` config block.

## 14. Security

- Key in `.env` (gitignored) as `OPENROUTER_API_KEY`; rotate the key pasted in chat.
