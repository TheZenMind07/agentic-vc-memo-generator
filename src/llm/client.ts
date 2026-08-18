import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ZodType, ZodTypeDef } from "zod";
import type { LlmConfig } from "../types";

export interface LlmOpts {
  model?: string;
  temperature?: number;
  maxRetries?: number;
  /** Max output tokens (bounds cost; some models default to a huge value). */
  maxTokens?: number;
  /** Per-request timeout (ms). Defaults to 180s so a hung provider degrades instead of hanging the run. */
  timeoutMs?: number;
  /** Enable web search (only supported by search models like perplexity/sonar). */
  webSearch?: boolean;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/**
 * Extract a JSON value from an LLM response that may include markdown fences or
 * surrounding prose. Returns `null` when no JSON can be isolated.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  // 1. Direct parse.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }

  // 2. Strip ```json ... ``` fences.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* continue */
    }
  }

  // 3. Locate the outermost { ... } or [ ... ] span.
  const openers = ["{", "["];
  const closers = ["]", "}"];
  for (const open of openers) {
    const start = trimmed.indexOf(open);
    if (start === -1) continue;
    const close = open === "{" ? "}" : "]";
    const end = trimmed.lastIndexOf(close);
    if (end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        /* continue */
      }
    }
    void closers;
  }

  return null;
}

export class LlmClient {
  private client: OpenAI;
  private cfg: LlmConfig;

  constructor(cfg: LlmConfig) {
    const apiKey = process.env[cfg.apiKeyEnv];
    if (!apiKey) {
      throw new LlmError(`Missing API key: ${cfg.apiKeyEnv} is not set in the environment (.env)`);
    }
    this.cfg = cfg;
    this.client = new OpenAI({ baseURL: cfg.baseUrl, apiKey });
  }

  private async rawChat(messages: ChatCompletionMessageParam[], opts: LlmOpts): Promise<string> {
    const model = opts.model ?? this.cfg.model;
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 4000,
    };
    if (opts.webSearch) {
      body.web_search_options = { search_context_size: "high" };
    }

    const maxRetries = opts.maxRetries ?? 3;
    const timeoutMs = opts.timeoutMs ?? 180_000;
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await this.client.chat.completions.create(
          body as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
          { timeout: timeoutMs, signal: AbortSignal.timeout(timeoutMs) },
        );
        // `choices` may be absent on a 200-with-error body from some providers.
        const content = res.choices?.[0]?.message?.content ?? "";
        if (content.trim() === "") {
          const empty = new Error("Empty response content from model") as Error & { status?: number };
          empty.status = 500;
          throw empty;
        }
        return content;
      } catch (err) {
        lastErr = err;
        // Transient failures (rate limit / server error / timeout) get a short backoff.
        const status = (err as { status?: number })?.status;
        const aborted = (err as { name?: string })?.name === "AbortError" || (err as { name?: string })?.name === "TimeoutError";
        if (status === 429 || (status !== undefined && status >= 500) || aborted) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw new LlmError(`LLM call failed: ${(err as Error).message}`, err);
      }
    }
    throw new LlmError("LLM call failed after retries", lastErr);
  }

  /** Search-enabled completion (uses the configured search model). */
  async search(messages: ChatCompletionMessageParam[], opts: LlmOpts = {}): Promise<string> {
    return this.rawChat(messages, { ...opts, model: opts.model ?? this.cfg.searchModel, webSearch: true });
  }

  /**
   * Search-enabled JSON completion: like `json` but with web search turned on
   * (and repairs also run through search). Used for dynamic discovery.
   */
  async searchJson<T>(schema: ZodType<T, ZodTypeDef, unknown>, messages: ChatCompletionMessageParam[], opts: LlmOpts = {}): Promise<T> {
    const maxRetries = opts.maxRetries ?? 3;
    const history = [...messages];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const raw = await this.search(history, opts);
      const parsed = extractJson(raw);
      if (parsed !== null) {
        const result = schema.safeParse(parsed);
        if (result.success) return result.data;
      }
      history.push({ role: "assistant", content: raw });
      history.push({
        role: "user",
        content:
          "Return ONLY valid JSON matching the requested schema, with no surrounding text or prose.",
      });
    }

    throw new LlmError("Search model failed to produce schema-valid JSON after retries");
  }

  /** Plain text completion (uses the configured default model). */
  async text(messages: ChatCompletionMessageParam[], opts: LlmOpts = {}): Promise<string> {
    return this.rawChat(messages, { ...opts, webSearch: false });
  }

  /**
   * JSON completion with zod validation + repair retries. On validation failure
   * the zod error is fed back to the model so it can correct the structure.
   */
  async json<T>(schema: ZodType<T, ZodTypeDef, unknown>, messages: ChatCompletionMessageParam[], opts: LlmOpts = {}): Promise<T> {
    const maxRetries = opts.maxRetries ?? 3;
    const history = [...messages];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const raw = await this.rawChat(history, { ...opts, webSearch: false });
      const parsed = extractJson(raw);
      if (parsed === null) {
        history.push({
          role: "assistant",
          content: raw,
        });
        history.push({
          role: "user",
          content:
            "Your response was not valid JSON. Return ONLY valid JSON matching the requested schema, with no surrounding text.",
        });
        continue;
      }

      const result = schema.safeParse(parsed);
      if (result.success) return result.data;

      const issues = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      history.push({ role: "assistant", content: raw });
      history.push({
        role: "user",
        content:
          `Your response failed schema validation. Fix ONLY these structural issues and return valid JSON:\n${issues}`,
      });
    }

    throw new LlmError("LLM failed to produce schema-valid JSON after retries");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
