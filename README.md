# Emergence — AI-Augmented Investment Pipeline

A single-command pipeline that turns a seed input into one-page investment memos:

```
seed input -> Sourcing -> Analysis -> Recommendation -> memos (Pass / Watch / Take a meeting)
```

Built as a TypeScript/Node CLI on OpenRouter. Three stages are cleanly separated and
re-runnable; every claim is traceable to a source; the AI workflow is documented
(specs, prompts, decisions) alongside the code.

## Quick start

```bash
npm install
cp .env.example .env        # then set OPENROUTER_API_KEY
npm run pipeline            # interactive: pick a source mode
```

Or non-interactively:

```bash
npm run pipeline -- --source feed  --input yc                # YC 2025 (W25 + S25)
npm run pipeline -- --source topic --input "Agentic voice call assistant" --limit 5 
npm run pipeline -- --source urls  --input "url1,url2"        # or @urls.txt
npm run pipeline -- --source feed  --input yc --batch W25     # single batch
```

## CLI

| Flag | Meaning |
|------|---------|
| `--source topic\|urls\|feed` | source mode (prompts interactively if omitted) |
| `--input <v>` | topic query / comma-separated URLs (or `@file.txt`) / feed name |
| `--batch <v>` | feed batch filter (e.g. `W25`) |
| `--format text\|json` | terminal output format (default `text`) |
| `--limit <n>` | max candidates (default 15) |
| `--model <m>` | analysis/memo model |
| `--thesis-prose "<text>"` | supply thesis prose (derives rubric) |
| `--thesis-file <path>` | read thesis prose from file |
| `--config <path>` | config file (default `./pipeline.config.json`) |
| `--no-trail` | disable process-trail artifact generation |
| `--<dot.path> <v>` | override any config key, e.g. `--trail.journal.level verbose` |

## Models & cost

- **Discovery/enrichment:** `perplexity/sonar` (real web search, ~$1/M tokens).
- **Analysis/memos:** `deepseek/deepseek-v4-flash` (configurable via `--model`).
- Models, base URL, and key are configured under `llm` in `pipeline.config.json`.
- A full 15-candidate run costs roughly $1–2.

## Output

Each run writes to `outputs/run-<timestamp>/`:

```
thesis.md          # stated thesis + rubric (criteria, weights, success criteria)
candidates.json    # sourced + enriched candidates
analyses/<id>.json # structured analysis per candidate (team/product/market/risks/score)
memos/<id>.md      # one-page memo per candidate (also printed to terminal)
index.md           # summary table
run-config.json    # resolved config (thesis, rubric, trail, models)
```

## Thesis & scoring

The thesis is a first-class, per-run config. A prose thesis (`thesis.source: "prose"`)
is auto-derived into a machine-readable rubric; or supply the rubric directly
(`thesis.source: "rubric"`). Each criterion has `successCriteria` and a `weight`
(normalized to sum 1.0). The 0–100 score is

```
score = round( sum(weight_i × rating_i / scale_i) × 100 )
```

recomputed from per-criterion sub-scores (never the model's freehand number). Risks
are reported but not weighted into the score.

## Process visibility (configurable `trail`)

The `trail` config section controls which workflow artifacts are emitted; only what
is configured is written (and stamped into `run-config.json`):

| Point | Default | Purpose |
|-------|---------|---------|
| `specs` | on | `docs/spec-*.md` per-stage design specs |
| `journal` | on | `PROCESS.md` — AI-workflow journal (prompts tried, failures, attribution) |
| `prompts` | on | `docs/prompt-design.md` — prompt templates + rationale |
| `decisions` | on | `docs/decisions.md` — scoping calls / ADRs |
| `commits` | atomic | git commit granularity |

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest
```

## Notes

- `.env` is gitignored. Rotate any key that was ever pasted into chat.
- Free-tier models are rate-limited; the pipeline retries transient failures and
  degrades gracefully (a failed analysis becomes `score: null`, never a crash).
- Enrichment verifies the website to avoid name-collision false positives; missing
  data is marked `null`/`[inferred]`, never invented.
