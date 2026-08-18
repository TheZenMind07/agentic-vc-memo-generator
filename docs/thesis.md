# Thesis

> *We back AI-native agents that sell into SMBs with a self-serve motion, own their
> core model/integration layer, and defend a specific vertical via proprietary data
> or workflow lock-in. We pass on horizontal copilots, services-heavy revenue, and
> teams without technical depth. We require a live traction signal and a clear
> "why now".*

This prose thesis is the human-readable statement the pipeline scores against. Its
machine-readable form is `analysis.rubric.criteria` (below), derived clause-by-clause.
Both must agree; the pipeline renders this file from the rubric config so they cannot
drift.

## Default rubric

| key | label | weight | success criteria |
|-----|-------|--------|------------------|
| `team` | Team | 0.30 | Founder-market fit for the vertical; technical depth to own the core model/integration layer in-house; prior startup/exit or domain operating experience |
| `moat` | Defensibility | 0.25 | Proprietary data or workflow lock-in; switching costs/network effects, not a thin LLM wrapper; no dependence on a single horizontal platform for differentiation |
| `product` | Product | 0.20 | AI-native agent (acts end-to-end), not a copilot; self-serve onboarding for SMBs; articulate in one sentence |
| `market` | Market & Why-Now | 0.15 | Specific vertical with credible size hint; why-now driver (LLM cost collapse, vertical data, new API); identifiable competitors and a stated wedge |
| `traction` | Traction / Freshness | 0.10 | Live signal (paying customers, usage, funding, launch, HN/GitHub activity); recent, not stale |

Weights sum to 1.0. Scale = 5. Score = `Σ(weight × rating/5) × 100`.

> Note: a detailed thesis will be supplied later and dropped into the `thesis`
> config block (`source: "prose"`), which derives a new rubric automatically.
