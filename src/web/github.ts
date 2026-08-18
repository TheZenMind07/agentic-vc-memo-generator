import { fetchJson } from "./fetch";

export interface GithubRepo {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  pushed_at: string | null;
  html_url: string;
}

interface GithubResponse {
  items?: Array<{
    full_name?: string;
    description?: string | null;
    stargazers_count?: number;
    pushed_at?: string | null;
    html_url?: string;
  }>;
}

/** Search public GitHub repositories (unauthenticated, low rate limit). */
export async function searchRepos(query: string, perPage = 5): Promise<GithubRepo[]> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${perPage}`;
  const data = await fetchJson<GithubResponse>(url);
  return (data.items ?? []).map((r) => ({
    full_name: r.full_name ?? "",
    description: r.description ?? null,
    stargazers_count: r.stargazers_count ?? 0,
    pushed_at: r.pushed_at ?? null,
    html_url: r.html_url ?? "",
  }));
}
