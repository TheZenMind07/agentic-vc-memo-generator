import { load } from "cheerio";

const USER_AGENT = "emergence-pipeline/0.1 (investment research)";

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

/** Fetch a URL and return its body as text (JSON or HTML). */
export async function fetchText(url: string, timeoutMs = 20000): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/json,*/*" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new FetchError(`HTTP ${res.status} for ${url}`, res.status);
  return res.text();
}

/** Fetch a URL and return parsed JSON. */
export async function fetchJson<T>(url: string, timeoutMs = 20000): Promise<T> {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text) as T;
}

/** Strip a page of HTML down to plain text (bounded length). */
export function htmlToText(html: string, maxChars = 20000): string {
  const $ = load(html);
  $("script, style, noscript, svg, iframe, head").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.slice(0, maxChars);
}
