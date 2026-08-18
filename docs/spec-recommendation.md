# Spec — Stage 3: Recommendation

## Purpose
For each candidate, produce a one-page memo ending in a clear call:
**Pass / Watch / Take a meeting**, with rationale and 2–3 things that would change
the verdict. Memos must be skimmable in 60 seconds.

## Verdict rules
Deterministic base verdict from score + risk severity, so it's defensible:

| Condition | Verdict |
|-----------|---------|
| score >= 70 and no `critical` risk | `take_a_meeting` |
| score >= 70 but has `critical` risk | `watch` |
| score >= 50 | `watch` |
| score < 50 | `pass` |
| score is `null` (degraded) | `pass` (insufficient data) |

The LLM may argue for a different verdict in rationale; if it contradicts the rule,
the rule wins and the memo notes the override.

## Output schema (memo)

```ts
{
  candidateId: string;
  verdict: 'pass' | 'watch' | 'take_a_meeting';
  summary: string;           // 1-2 sentence headline
  rationale: string;         // why this verdict, tied to thesis + score
  changeMyMind: string[];    // 2-3 concrete triggers
  score: number | null;
}
```

## Memo rendering (markdown, one page)

```
# {name}
{website} | score {n}/100 | **Take a meeting**

{summary}

## What they do
{product.plainLanguage}

## Team
{team.summary}

## Market
{market.sizeHint} / {market.whyNow}

## Risks
- {risk} ({severity})

## Why {verdict}
{rationale}

## What would change my mind
- {trigger}
```

## Acceptance criteria
- A memo is readable and its call is understood within 60 seconds.
- Every memo ends in exactly one verdict.
- 2–3 `changeMyMind` triggers present; verdict matches the rule table.
