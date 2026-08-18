import "dotenv/config";
import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { RunConfig, SourceConfig } from "./types";
import { deepSet, loadConfigFile, resolveConfig } from "./config";
import { runPipeline } from "./pipeline";

const USAGE = `AI-augmented investment pipeline

Usage:
  npm run pipeline -- [flags]

Source flags (pick one mode; if omitted, you'll be prompted interactively):
  --source topic  --input "<query>"              discover via web search
  --source urls   --input "url1,url2" | @file.txt  fetch + extract from URLs
  --source feed   --input yc|producthunt|hn [--batch W25]  pull a curated feed

Other flags:
  --format text|json       output format (default text)
  --model <model>          analysis/memo model (OpenRouter)
  --limit <n>              max candidates (overrides targetCandidates)
  --thesis-prose "<text>"  supply thesis prose (source=prose)
  --thesis-file <path>     read thesis prose from a file
  --config <path>          config file (default ./pipeline.config.json)
  --no-trail               disable process-trail artifact generation
  --<dot.path> <value>     override any config key, e.g. --trail.journal.level verbose
  -h, --help               show this help
`;

function coerce(v: string): unknown {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

interface CliResult {
  overrides: Record<string, unknown>;
  sourceType?: string;
  input?: string;
  batch?: string;
  configPath?: string;
  thesisProse?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliResult {
  const overrides: Record<string, unknown> = {};
  let sourceType: string | undefined;
  let input: string | undefined;
  let batch: string | undefined;
  let configPath: string | undefined;
  let thesisProse: string | undefined;
  let thesisFile: string | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") {
      help = true;
      continue;
    }
    if (a === "--no-trail") {
      deepSet(overrides, "trail.enabled", false);
      continue;
    }
    if (!a.startsWith("--")) continue;

    let key: string;
    let inlineValue: string | undefined;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      key = a.slice(2, eq);
      inlineValue = a.slice(eq + 1);
    } else {
      key = a.slice(2);
    }

    let value: string;
    if (inlineValue !== undefined) {
      value = inlineValue;
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        value = "true";
      } else {
        value = next;
        i++;
      }
    }

    switch (key) {
      case "source":
        sourceType = value;
        break;
      case "input":
        input = value;
        break;
      case "batch":
        batch = value;
        break;
      case "format":
        deepSet(overrides, "output.format", value);
        break;
      case "model":
        deepSet(overrides, "llm.model", value);
        deepSet(overrides, "analysis.model", value);
        break;
      case "limit":
        deepSet(overrides, "sourcing.limit", Number(value));
        break;
      case "config":
        configPath = value;
        break;
      case "thesis-prose":
        thesisProse = value;
        break;
      case "thesis-file":
        thesisFile = value;
        break;
      default:
        deepSet(overrides, key, coerce(value));
        break;
    }
  }

  if (thesisFile) {
    thesisProse = fs.readFileSync(thesisFile, "utf8").trim();
  }
  if (thesisProse) {
    overrides.thesis = { source: "prose", prose: thesisProse };
  }

  return { overrides, sourceType, input, batch, configPath, thesisProse, help };
}

function parseUrls(inputValue: string): string[] {
  if (inputValue.startsWith("@")) {
    const file = inputValue.slice(1);
    return fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  return inputValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildSource(type: string | undefined, inputValue: string | undefined, batch: string | undefined): SourceConfig {
  switch (type) {
    case "topic":
      return { type: "topic", query: inputValue ?? "" };
    case "urls":
      return { type: "urls", urls: parseUrls(inputValue ?? "") };
    case "feed": {
      const feed = (inputValue || "yc") as "yc" | "producthunt" | "hn";
      return batch ? { type: "feed", feed, batch } : { type: "feed", feed };
    }
    default:
      throw new Error(`Unknown source type: ${type}`);
  }
}

async function promptSource(): Promise<SourceConfig> {
  const rl = readline.createInterface({ input, output });
  try {
    const mode = (await rl.question("Source mode? [topic/urls/feed]: ")).trim().toLowerCase();
    if (mode === "topic") {
      const query = (await rl.question("Topic query: ")).trim();
      return { type: "topic", query };
    }
    if (mode === "urls") {
      const urls = (await rl.question("URLs (comma-separated, or @file.txt): ")).trim();
      return { type: "urls", urls: parseUrls(urls) };
    }
    if (mode === "feed") {
      const feed = (await rl.question("Feed [yc/producthunt/hn] (default yc): ")).trim().toLowerCase() || "yc";
      const batch = (await rl.question("Batch (optional, e.g. W25): ")).trim();
      return batch
        ? { type: "feed", feed: feed as "yc" | "producthunt" | "hn", batch }
        : { type: "feed", feed: feed as "yc" | "producthunt" | "hn" };
    }
    throw new Error(`Unknown source mode: "${mode}" (expected topic/urls/feed)`);
  } finally {
    rl.close();
  }
}

function printConfig(config: RunConfig): void {
  console.log("Resolved config:");
  console.log(`  source        ${config.source.type}` +
    ("query" in config.source ? ` "${config.source.query}"` : "") +
    ("urls" in config.source ? ` (${config.source.urls.length} urls)` : "") +
    ("feed" in config.source ? ` ${config.source.feed}` + (config.source.batch ? ` batch=${config.source.batch}` : "") : ""));
  console.log(`  thesis        ${config.thesis.source}${config.thesis.prose ? ` (${config.thesis.prose.length} chars)` : ""}`);
  console.log(`  analysis      ${config.analysis.model}`);
  console.log(`  search        ${config.llm.searchModel}`);
  console.log(`  candidates    ${config.sourcing.limit ?? config.sourcing.targetCandidates}`);
  console.log(`  format        ${config.output.format}`);
  console.log(`  rubric        ${config.analysis.rubric.criteria.map((c) => `${c.key}:${c.weight}`).join(" ")}`);
}

async function main(): Promise<void> {
  const { overrides, sourceType, input: inputValue, batch, configPath, help } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log(USAGE);
    return;
  }

  let source: SourceConfig;
  if (sourceType) {
    source = buildSource(sourceType, inputValue, batch);
  } else {
    const fileCfg = loadConfigFile(configPath);
    if (fileCfg?.source) {
      source = fileCfg.source as SourceConfig;
    } else {
      source = await promptSource();
    }
  }

  const config = resolveConfig(overrides, configPath, source);
  printConfig(config);
  console.log();
  await runPipeline(config);
}

main().catch((err) => {
  console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
