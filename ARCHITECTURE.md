# Architecture: `emergence` — AI-augmented investment research pipeline

A TypeScript Node CLI that discovers startups, scores them against an investment thesis (rubric), and writes decision memos. 60 files, ~361 symbols, 27 execution flows.

## Module map (6 functional clusters)

| Cluster | Files | Role |
|---|---|---|
| **Cluster_2** (CLI) | `src/cli.ts` | Arg parsing, source selection, entry point |
| **Cluster_3** (Config) | `src/config.ts`, `src/scoring.ts` | Defaults, deep-merge, rubric/weight normalization |
| **Llm** | `src/llm/client.ts`, `src/llm/prompts.ts`, `src/sourcing/*` | OpenAI/OpenRouter client, JSON w/ repair, prompts |
| **Web** | `src/web/fetch.ts`, `src/web/hn.ts`, `src/web/github.ts` | HTTP fetch, HN (Algolia), GitHub |
| **Analysis** | `src/analysis/index.ts`, `src/pipeline.ts`, `src/scoring.ts` | Score candidates vs rubric |
| **Recommendation** | `src/recommendation/memo.ts` | Verdict + memo rendering |

## Execution flow

`main()` → `parseArgs` → `resolveConfig` → `runPipeline` → 3-stage loop → `output/writer`.

```mermaid
flowchart TB
    subgraph CLI["Cluster_2 — src/cli.ts"]
        MAIN[main]
        ARGS[parseArgs]
        SRC[buildSource / promptSource]
        PCFG[printConfig]
    end

    subgraph CFG["Cluster_3 — src/config.ts"]
        DC[defaultConfig]
        LM[deepMerge]
        LCF[loadConfigFile]
        RC[resolveConfig]
    end

    subgraph PIPE["src/pipeline.ts"]
        RP[runPipeline]
        RT[resolveThesis]
        FBM[fallbackMemo]
    end

    subgraph LLM["Llm — src/llm"]
        LC[LlmClient]
        RChat[rawChat]
        SRCH[search / searchJson]
        JSON[json + extractJson]
        PR[prompts.ts]
    end

    subgraph SOURCING["Sourcing — src/sourcing"]
        RS[runSourcing]
        DT[discoverTopic]
        DU[discoverUrls]
        DF[discoverFeed]
        EN[enrichCandidate]
        DED[dedupe]
    end

    subgraph WEB["Web — src/web"]
        FT[fetchText/fetchJson]
        HTT[htmlToText]
        HN[searchHn]
        GH[searchRepos]
    end

    subgraph ANALYSIS["Analysis — src/analysis"]
        RA[runAnalysis]
        BA[buildAnalysis]
        MSUB[matchSubScore]
        DA[degradedAnalysis]
    end

    subgraph SCORING["src/scoring.ts"]
        NRM[normalizeRubric]
        CS[computeScore]
    end

    subgraph RECO["Recommendation — src/recommendation"]
        RR[runRecommendation]
        VF[verdictFor]
        RM[renderMemo]
    end

    subgraph OUT["Output — src/output/writer.ts"]
        CDIR[createRunDirs]
        W[write* files]
        IDX[writeIndex]
        PRT[printResults]
    end

    MAIN --> ARGS --> SRC --> RC --> RP
    DC --> RC
    LCF --> RC
    RP --> RT --> JSON
    RT --> NRM

    RP --> RS
    RS --> DT --> SRCH
    RS --> DU --> FT
    RS --> DF --> FT
    DF --> HN
    DF --> GH
    RS --> EN --> SRCH
    EN --> HN
    RS --> DED

    RP -->|per candidate| RA --> JSON --> BA
    BA --> MSUB --> CS

    RP -->|per candidate| RR --> JSON
    RR --> VF
    RR --> RM

    RP --> CDIR --> W --> IDX --> PRT

    RA -.failure.-> DA
    RR -.failure.-> FBM
```

## Data flow detail

1. **Config resolution** (`resolveConfig`): `defaultConfig` ← `pipeline.config.json` ← CLI dot-path overrides (`--trail.journal.level`), then `zod` validation + `normalizeRubric` (weights → sum 1.0).

2. **Stage 1 — Sourcing** (`runSourcing`, `src/sourcing/index.ts:10`): picks one discovery mode (`topic` via search-model, `urls` via fetch+extract, `feed` via YC API/HN Algolia), dedupes, then enriches each candidate (founders/funding via `searchJson`, HN traction fallback).

3. **Stage 2 — Analysis** (`runAnalysis`, `src/analysis/index.ts:86`): LLM returns structured JSON (team/product/market/risks/subScores) validated by `zod`; `buildAnalysis` reconciles model sub-scores to rubric keys via `matchSubScore` and recomputes the score deterministically with `computeScore` (LLM never writes the number directly).

4. **Stage 3 — Recommendation** (`runRecommendation`, `src/recommendation/memo.ts:50`): `verdictFor` computes a rule-based verdict from score + risk severity; the LLM's verdict is accepted only if it agrees, otherwise the deterministic verdict wins. `renderMemo` emits a one-page markdown memo.

5. **Output** (`src/output/writer.ts`): timestamped `outputs/run-*/` dir with `thesis.md`, `candidates.json`, per-candidate `analyses/*.json` + `memos/*.md`, and a ranked `index.md`; `printResults` renders text or JSON to stdout.

Key resilience pattern: every LLM call goes through `LlmClient.json/searchJson` which strips markdown fences (`extractJson`), validates against `zod`, and feeds validation errors back to the model for repair (up to 3 retries). Failures degrade gracefully — `degradedAnalysis` and `fallbackMemo` keep the pipeline running.

## Sequence diagram

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant CLI as cli.ts
    participant CFG as config.ts
    participant P as pipeline.ts
    participant S as sourcing
    participant L as LlmClient
    participant A as analysis
    participant R as recommendation
    participant O as output/writer
    participant API as OpenRouter / Web

    U->>CLI: npm run pipeline -- --source feed --input yc
    CLI->>CFG: resolveConfig(defaults, file, overrides)
    CFG-->>CLI: RunConfig (rubric normalized)

    CLI->>P: runPipeline(config)
    P->>L: new LlmClient(config.llm)
    P->>O: createRunDirs()
    P->>L: resolveThesis (only if source=prose)
    L->>API: derive rubric (JSON)
    API-->>L: rubric
    P->>O: writeThesis / writeRunConfig

    P->>S: runSourcing(client, config)
    S->>L: discoverTopic / discoverFeed / discoverUrls
    L->>API: web search / YC API / HN Algolia
    API-->>L: raw candidates
    S->>S: dedupe + slice(limit)
    par enrich candidates (concurrency N)
        S->>L: enrichCandidate(c)
        L->>API: searchJson (founders/funding)
    end
    S-->>P: Candidate[]
    P->>O: writeCandidates

    par per candidate (concurrency N)
        P->>A: runAnalysis(client, config, c)
        A->>L: json(llmAnalysisSchema, messages)
        L->>API: analysis completion
        API-->>L: team/product/market/risks/subScores
        A->>A: buildAnalysis + matchSubScore + computeScore
        A-->>P: Analysis
        P->>O: writeAnalysis

        P->>R: runRecommendation(client, config, c, analysis)
        R->>R: verdictFor(score, risks) — deterministic
        R->>L: json(llmMemoSchema, messages)
        L->>API: memo completion
        API-->>L: verdict/summary/rationale
        R->>R: verdict = deterministic wins on mismatch
        R-->>P: Memo
        P->>O: writeMemo (md + json)
    end

    P->>O: writeIndex (ranked by score)
    P->>O: printResults (text/json)
    O-->>U: stdout + outputs/run-*/
```

Notes on the diagram: the `par` blocks run with bounded concurrency (`config.concurrency`, default 4) via `mapWithConcurrency`, which preserves input order in the results array. LLM failures inside a candidate degrade to `degradedAnalysis` / `fallbackMemo` rather than aborting the run.
