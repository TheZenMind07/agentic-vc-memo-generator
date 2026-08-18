import fs from "node:fs";
import path from "node:path";
import type { Analysis, Candidate, Memo, Rubric, RunConfig } from "../types";
import { VERDICT_LABEL, renderMemo } from "../recommendation/memo";

export interface RunDirs {
  root: string;
  analyses: string;
  memos: string;
  cache: string;
}

export function createRunDirs(baseDir = "outputs"): RunDirs {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .replace(/\.\d+Z$/, "");
  const root = path.join(baseDir, `run-${stamp}`);
  const analyses = path.join(root, "analyses");
  const memos = path.join(root, "memos");
  const cache = path.join(root, ".cache");
  for (const dir of [root, analyses, memos, cache]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return { root, analyses, memos, cache };
}

export function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function writeTextFile(filePath: string, text: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text + "\n", "utf8");
}

export function writeRunConfig(dirs: RunDirs, config: RunConfig): void {
  writeJsonFile(path.join(dirs.root, "run-config.json"), config);
}

export function writeThesis(dirs: RunDirs, prose: string | null, rubric: Rubric): void {
  const criteria = rubric.criteria
    .map((c) => `- **${c.label}** (${c.key}, weight ${c.weight}, scale ${c.scale})\n${c.successCriteria.map((s) => `  - ${s}`).join("\n")}`)
    .join("\n");
  const body = prose
    ? `> ${prose}\n\n## Derived rubric\n\n${criteria}\n`
    : `## Rubric\n\n${criteria}\n`;
  writeTextFile(path.join(dirs.root, "thesis.md"), body);
}

export function writeCandidates(dirs: RunDirs, candidates: Candidate[]): void {
  writeJsonFile(path.join(dirs.root, "candidates.json"), candidates);
}

export function writeAnalysis(dirs: RunDirs, analysis: Analysis): void {
  writeJsonFile(path.join(dirs.analyses, `${analysis.candidateId}.json`), analysis);
}

export function writeMemo(dirs: RunDirs, memoText: string, memo: Memo): void {
  writeTextFile(path.join(dirs.memos, `${memo.candidateId}.md`), memoText);
  writeJsonFile(path.join(dirs.memos, `${memo.candidateId}.json`), memo);
}

export interface RunResult {
  candidate: Candidate;
  analysis: Analysis;
  memo: Memo;
}

export function writeIndex(dirs: RunDirs, results: RunResult[]): void {
  const rows = results
    .sort((a, b) => (b.memo.score ?? -1) - (a.memo.score ?? -1))
    .map((r) => {
      const score = r.memo.score === null ? "n/a" : `${r.memo.score}`;
      const website = r.candidate.website ?? "";
      return `| ${r.candidate.name} | ${score} | ${VERDICT_LABEL[r.memo.verdict]} | ${website} | [memo](memos/${r.memo.candidateId}.md) |`;
    })
    .join("\n");
  writeTextFile(
    path.join(dirs.root, "index.md"),
    `# Investment Memos\n\n| Company | Score | Verdict | Website | Memo |\n|---|---|---|---|---|\n${rows}\n`,
  );
}

/** Terminal output: readable text per company, or JSON to stdout. */
export function printResults(results: RunResult[], format: "text" | "json"): void {
  if (format === "json") {
    const payload = results.map((r) => ({
      candidate: r.candidate,
      analysis: r.analysis,
      memo: r.memo,
    }));
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  for (const r of results) {
    console.log("\n" + "=".repeat(72));
    console.log(renderMemo(r.candidate, r.analysis, r.memo));
  }
  console.log("\n" + "=".repeat(72));
}
