import { CandidateInput, ResearchResult } from "./types";

const X_API_URL = "https://api.x.com/2";
const GITHUB_API_URL = "https://api.github.com";

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchXInsights(handle: string): Promise<{ summary: string; warning?: string }> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    return {
      summary: "",
      warning: "X_BEARER_TOKEN missing. Add it to pull live posts."
    };
  }

  try {
    const userRes = await fetch(`${X_API_URL}/users/by/username/${handle}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });

    if (!userRes.ok) {
      return { summary: "", warning: `X lookup failed (${userRes.status}) for @${handle}` };
    }

    const user = await safeJson<{ data?: { id: string; name: string } }>(userRes);
    const userId = user?.data?.id;
    if (!userId) return { summary: "", warning: `Could not resolve X user @${handle}` };

    const postsRes = await fetch(
      `${X_API_URL}/users/${userId}/tweets?max_results=5&tweet.fields=created_at,public_metrics`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );

    if (!postsRes.ok) {
      return { summary: "", warning: `X posts fetch failed (${postsRes.status}) for @${handle}` };
    }

    const posts = await safeJson<{
      data?: Array<{ id: string; text: string; created_at: string }>;
    }>(postsRes);
    const lines =
      posts?.data?.map(
        (p) => `• ${p.text.slice(0, 180)}${p.text.length > 180 ? "..." : ""} (${p.created_at})`
      ) ?? [];

    return {
      summary:
        lines.length > 0
          ? `Recent X posts for @${handle}:\n${lines.join("\n")}`
          : `No recent posts found for @${handle}.`
    };
  } catch (err) {
    return { summary: "", warning: `X fetch error for @${handle}: ${(err as Error).message}` };
  }
}

async function fetchGithubInsights(handle: string): Promise<{ summary: string; warning?: string }> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { "User-Agent": "recruiter-guard" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const profileRes = await fetch(`${GITHUB_API_URL}/users/${handle}`, {
      headers,
      cache: "no-store"
    });

    if (!profileRes.ok) {
      return {
        summary: "",
        warning: `GitHub lookup failed (${profileRes.status}) for ${handle}`
      };
    }

    const profile = await safeJson<{
      name?: string;
      bio?: string;
      public_repos?: number;
      followers?: number;
      html_url?: string;
    }>(profileRes);

    const eventsRes = await fetch(`${GITHUB_API_URL}/users/${handle}/events/public?per_page=5`, {
      headers,
      cache: "no-store"
    });

    const events = await safeJson<Array<{ type: string; repo?: { name: string }; created_at: string }>>(
      eventsRes
    );

    const recentActivity =
      events
        ?.slice(0, 5)
        .map(
          (e) =>
            `• ${e.type.replace("Event", "")} at ${e.repo?.name ?? "unknown repo"} (${e.created_at})`
        )
        .join("\n") ?? "No recent activity.";

    return {
      summary: `GitHub: ${profile?.name ?? handle}\nBio: ${profile?.bio ?? "n/a"}\nPublic repos: ${
        profile?.public_repos ?? 0
      } | Followers: ${profile?.followers ?? 0}\n${recentActivity}\nProfile: ${
        profile?.html_url ?? "n/a"
      }`
    };
  } catch (err) {
    return { summary: "", warning: `GitHub fetch error for ${handle}: ${(err as Error).message}` };
  }
}

async function fetchLinkedInNote(profile: string): Promise<{ summary: string; warning?: string }> {
  if (!profile) return { summary: "" };
  // LinkedIn's public API is limited; this placeholder keeps the UX coherent.
  return {
    summary: `LinkedIn profile provided: ${profile}. Add People Data Labs / Proxycurl token if you want richer pulls.`,
    warning: "LinkedIn enrichment is stubbed; wire an API provider to go deeper."
  };
}

export async function gatherResearch(candidate: CandidateInput): Promise<ResearchResult> {
  const blocks: string[] = [];
  const warnings: string[] = [];

  if (candidate.linkedin) {
    const li = await fetchLinkedInNote(candidate.linkedin);
    if (li.summary) blocks.push(li.summary);
    if (li.warning) warnings.push(li.warning);
  }

  if (candidate.x) {
    const x = await fetchXInsights(candidate.x);
    if (x.summary) blocks.push(x.summary);
    if (x.warning) warnings.push(x.warning);
  }

  if (candidate.github) {
    const gh = await fetchGithubInsights(candidate.github);
    if (gh.summary) blocks.push(gh.summary);
    if (gh.warning) warnings.push(gh.warning);
  }

  const fallback =
    blocks.length === 0
      ? "No external signals fetched yet. Ask the user for more links or provide a quick self-intro."
      : "";

  return {
    candidate,
    researchNotes: [blocks.join("\n\n"), fallback].filter(Boolean).join("\n\n"),
    sources: {
      linkedin: candidate.linkedin,
      x: candidate.x,
      github: candidate.github,
      warnings
    }
  };
}

