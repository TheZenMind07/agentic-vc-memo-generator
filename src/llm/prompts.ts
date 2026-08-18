import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Candidate, Rubric, Verdict } from "../types";

export function system(content: string): ChatCompletionMessageParam {
  return { role: "system", content };
}

export function user(content: string): ChatCompletionMessageParam {
  return { role: "user", content };
}

export function rubricBlock(rubric: Rubric): string {
  return rubric.criteria
    .map((c) => `- ${c.label} (key "${c.key}", weight ${c.weight}, rate 0..${c.scale}):\n${c.successCriteria.map((s) => `    - ${s}`).join("\n")}`)
    .join("\n");
}

export function thesisText(rubric: Rubric): string {
  const clauses = rubric.criteria.map((c) => c.label).join(", ");
  return `We invest in startups that score well on: ${clauses} (see rubric).`;
}

// --- Sourcing ---------------------------------------------------------------

export function discoverTopic(query: string, targetCount: number): ChatCompletionMessageParam[] {
  return [
    system(
      "You are a startup-sourcing analyst. Use web search to find real, recent companies. " +
        "Return ONLY a JSON array. If a field is not findable, use null or [] — never invent facts. " +
        "Every claim must cite the source URL where you found it.",
    ),
    user(
      `Find ${targetCount} startups matching this query:\n"${query}"\n\n` +
        `Return a JSON array of objects with exactly these fields:\n` +
        `{ "name": string, "website": string|null, "oneLiner": string|null, ` +
        `"founders": string[], "tractionSignal": { "type": "launch"|"funding"|"hn"|"github"|"other", ` +
        `"value": string, "sourceUrl": string, "date": string|null } | null, "sourceUrls": string[] }`,
    ),
  ];
}

export function enrichCandidate(name: string, website: string | null): ChatCompletionMessageParam[] {
  return [
    system(
      "You are a startup researcher. Use web search to find public signals. " +
        "Return ONLY JSON. If a field is not findable, use null — never invent.",
    ),
    user(
      `For startup "${name}"${website ? ` (${website})` : ""}, find public signals:\n` +
        `- funding rounds or recent launch (amount, date, source URL)\n` +
        `- founder names and backgrounds (prior startups/exits, technical depth)\n\n` +
        `Only report signals that clearly refer to THIS company (verify the website matches). ` +
        `If the only matches are a different company with the same name, use null.\n\n` +
        `Return JSON: { "funding": { "value": string, "sourceUrl": string, "date": string|null } | null, ` +
        `"founders": [{ "name": string, "background": string|null }], "teamSignal": string|null }`,
    ),
  ];
}

// --- Analysis ---------------------------------------------------------------

export function analyzeCandidate(
  candidate: Candidate,
  rubric: Rubric,
  thesis: string,
): ChatCompletionMessageParam[] {
  const facts = [
    `Name: ${candidate.name}`,
    `Website: ${candidate.website ?? "unknown"}`,
    `One-liner: ${candidate.oneLiner ?? "unknown"}`,
    `Founders: ${candidate.founders.length ? candidate.founders.join(", ") : "unknown"}`,
    `Team signal: ${candidate.teamSignal ?? "unknown"}`,
    `Traction signal: ${candidate.tractionSignal ? candidate.tractionSignal.value : "none"}`,
    `Source URLs: ${candidate.sourceUrls.join(", ") || "none"}`,
  ].join("\n");

  return [
    system(
      "You are an investment analyst. Analyze a startup against a stated thesis and rubric. " +
        "Return ONLY JSON. Cite source URLs for factual claims; prefix a claim with \"[inferred]\" " +
        "when reasoning without a source; use null when a field is unknown. Never invent data.",
    ),
    user(
      `Thesis:\n${thesis}\n\n` +
        `Scoring rubric (rate each criterion 0..its scale against its success criteria):\n` +
        `${rubricBlock(rubric)}\n\n` +
        `Candidate:\n${facts}\n\n` +
        `Return JSON matching:\n` +
        `{\n` +
        `  "team": { "summary": string, "founders": [{ "name": string, "background": string|null, "priorExits": boolean|null }], ` +
        `"technicalDepth": string|null, "sourceUrls": string[] },\n` +
        `  "product": { "plainLanguage": string, "category": string|null, "sourceUrls": string[] },\n` +
        `  "market": { "sizeHint": string|null, "competitiveLandscape": string|null, "whyNow": string|null, "sourceUrls": string[] },\n` +
        `  "risks": [{ "text": string, "severity": "low"|"medium"|"high"|"critical" }],\n` +
        `  "subScores": [{ "key": string, "label": string, "rating": number, "scale": number, "weight": number, "rationale": string }],\n` +
        `  "scoreRationale": string\n` +
        `}\n` +
        `Rules: subScores must use the exact criterion keys/labels/weights from the rubric. ` +
        `Rating scale: 0 = no evidence / weakest, ${rubric.criteria[0]?.scale ?? 5} = exceptional / strongest; ` +
        `use the full range (a neutral rating is the midpoint). ` +
        `The final 0-100 score is computed from subScores — do not freehand it; leave it out (omit "score").`,
    ),
  ];
}

// --- Recommendation ---------------------------------------------------------

export function recommend(
  candidate: Candidate,
  score: number | null,
  verdictRule: string,
  rubric: Rubric,
): ChatCompletionMessageParam[] {
  return [
    system(
      "You are an investment memo writer. Produce a one-page memo with a clear call. " +
        "Return ONLY JSON. Tie the rationale to the thesis and score; the verdict MUST match the rule given.",
    ),
    user(
      `Write a one-page investment memo for "${candidate.name}" (${candidate.website ?? "no website"}).\n\n` +
        `Thesis criteria: ${thesisText(rubric)}\n` +
        `Score: ${score === null ? "insufficient data" : score + "/100"}\n` +
        `Verdict rule: ${verdictRule}\n\n` +
        `Return JSON: { "verdict": "pass"|"watch"|"take_a_meeting", "summary": string, ` +
        `"rationale": string, "changeMyMind": string[] }.\n` +
        `changeMyMind must be 2-3 specific, concrete triggers that would change the call ` +
        `(e.g. "signs first 10 paying SMB customers", "hires a sales leader").`,
    ),
  ];
}

// --- Thesis derivation (prose -> rubric) ------------------------------------

export function deriveRubricFromProse(prose: string): ChatCompletionMessageParam[] {
  return [
    system(
      "You derive a machine-readable scoring rubric from an investment thesis. " +
        "Return ONLY JSON. Weights must be positive and should sum to ~1.0.",
    ),
    user(
      `Given this investment thesis:\n"""\n${prose}\n"""\n\n` +
        `Return JSON: { "criteria": [{ "key": string, "label": string, "weight": number, ` +
        `"successCriteria": string[], "scale": number }] }.\n` +
        `Extract 4-6 distinct, non-overlapping criteria. Each successCriteria is a single ` +
        `specific, checkable statement. scale should be 5.`,
    ),
  ];
}

export function rubricFor(verdict: Verdict): string {
  return verdict === "pass" ? "Pass" : verdict === "watch" ? "Watch" : "Take a meeting";
}
