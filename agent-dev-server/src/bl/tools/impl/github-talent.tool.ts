/**
 * GitHub Talent Search Tool
 *
 * Searches GitHub users by keywords, language, location, etc.
 * Uses the public GitHub REST API. When a Personal Access Token is configured
 * (via GitHubTokenConfig component → tRPC router), the tool uses authenticated
 * requests for higher rate limits (5000 req/hr vs 10 req/min).
 */
import { z } from 'zod';
import {
  ToolModel,
  type AgentState,
  type ToolExecuteContext,
  type ToolExecuteResult,
} from '../../agent/agent-library';
import { getSessionKey, type DevServerAppState } from '../../agent/agent-state';
import { getGitHubToken } from '../../../trpc/routers/github-token.router';

const GitHubTalentSchema = z.object({
  keywords: z
    .string()
    .describe('Search keywords: technologies, skills, or topics (e.g. "kubernetes devops", "react typescript")'),
  language: z
    .string()
    .optional()
    .describe('Primary programming language filter (e.g. "Go", "Python", "TypeScript")'),
  location: z
    .string()
    .optional()
    .describe('Location filter (e.g. "China", "San Francisco", "Remote")'),
  minRepos: z
    .number()
    .optional()
    .default(5)
    .describe('Minimum number of public repos'),
  minFollowers: z
    .number()
    .optional()
    .default(10)
    .describe('Minimum number of followers'),
  maxResults: z
    .number()
    .optional()
    .default(6)
    .describe('Maximum number of results to return (1-10)'),
});

type GitHubTalentInput = z.infer<typeof GitHubTalentSchema>;

interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  name: string | null;
  company: string | null;
  location: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  blog: string | null;
}

interface GitHubRepo {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  html_url: string;
}

export class SearchGitHubTalentTool extends ToolModel<GitHubTalentInput> {
  constructor() {
    super({
      name: 'searchGitHubTalent',
      description:
        'Search GitHub for talented developers matching specific criteria. Returns user profiles with their top repositories, languages, and contribution metrics. Use this after company diagnosis to find matching talent.',
      parametersSchema: GitHubTalentSchema,
      toolType: 'function',
      isStrict: false,
    });
  }

  #getHeaders(sessionKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitHubTalentScout/1.0',
    };
    if (sessionKey) {
      const token = getGitHubToken(sessionKey);
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  async execute(input: GitHubTalentInput, ctx: ToolExecuteContext): Promise<ToolExecuteResult> {
    console.log('[SearchGitHubTalent] Input:', JSON.stringify(input));

    // Get session key for token lookup
    const agentState = ctx.runner.state as AgentState<unknown, DevServerAppState>;
    const sessionKey = getSessionKey(agentState);
    const hasToken = sessionKey ? !!getGitHubToken(sessionKey) : false;

    try {
      // Build GitHub search query
      const queryParts: string[] = [];

      if (input.keywords) {
        queryParts.push(input.keywords);
      }
      if (input.language) {
        queryParts.push(`language:${input.language}`);
      }
      if (input.location) {
        queryParts.push(`location:${input.location}`);
      }
      if (input.minRepos && input.minRepos > 0) {
        queryParts.push(`repos:>=${input.minRepos}`);
      }
      if (input.minFollowers && input.minFollowers > 0) {
        queryParts.push(`followers:>=${input.minFollowers}`);
      }

      // Always add type:user
      queryParts.push('type:user');

      const query = queryParts.join(' ');
      const maxResults = Math.min(Math.max(input.maxResults || 6, 1), 10);
      const headers = this.#getHeaders(sessionKey);

      console.log('[SearchGitHubTalent] Query:', query, '| Authenticated:', hasToken);

      // Search users
      const searchUrl = `https://api.github.com/search/users?q=${encodeURIComponent(query)}&sort=followers&order=desc&per_page=${maxResults}`;
      const searchRes = await fetch(searchUrl, { headers });

      if (!searchRes.ok) {
        const errText = await searchRes.text();
        console.error('[SearchGitHubTalent] Search API error:', searchRes.status, errText);

        if (searchRes.status === 403) {
          return {
            output: hasToken
              ? 'GitHub API rate limit reached even with token. Please wait a moment and try again.'
              : 'GitHub API rate limit reached. Configure a GitHub Token via `GitHubTokenConfig` to get higher rate limits (5000 req/hr).',
            uiProps: { error: true, needsToken: !hasToken },
          };
        }
        return {
          output: `GitHub API error (${searchRes.status}). Please try again in a moment.`,
          uiProps: { error: true },
        };
      }

      const searchData = await searchRes.json() as { total_count: number; items: Array<{ login: string }> };

      if (!searchData.items || searchData.items.length === 0) {
        console.log('[SearchGitHubTalent] No users found');
        return {
          output: `No GitHub users found matching "${input.keywords}". Try broader keywords or fewer filters.`,
          uiProps: { talents: [], totalCount: 0 },
        };
      }

      // Fetch detailed profiles + top repos for each user (in parallel, max 6)
      const userLogins = searchData.items.slice(0, maxResults).map((u) => u.login);
      const talents = await Promise.all(
        userLogins.map((login) => this.#fetchUserProfile(login, headers)),
      );

      const validTalents = talents.filter((t) => t !== null);

      const result = {
        query: input.keywords,
        totalCount: searchData.total_count,
        talents: validTalents,
      };

      console.log('[SearchGitHubTalent] Output:', `Found ${validTalents.length} talents`);

      // Build summary for orchestrator
      const summary = validTalents
        .map(
          (t, i) =>
            `${i + 1}. ${t.name || t.login} (@${t.login}) — ${t.followers} followers, ${t.publicRepos} repos, Top langs: ${t.topLanguages.join(', ') || 'N/A'}`,
        )
        .join('\n');

      const authNote = hasToken ? '' : '\n\n(Tip: 未配置GitHub Token，当前使用公开API，速率有限)';

      return {
        output: `Found ${searchData.total_count} total matches. Top ${validTalents.length} profiles:\n\n${summary}${authNote}`,
        uiProps: result,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('[SearchGitHubTalent] Error:', errMsg);
      return {
        output: `Error searching GitHub: ${errMsg}`,
        uiProps: { error: true, message: errMsg },
      };
    }
  }

  async #fetchUserProfile(login: string, headers: Record<string, string>) {
    try {
      // Fetch user details and repos in parallel
      const [userRes, reposRes] = await Promise.all([
        fetch(`https://api.github.com/users/${login}`, { headers }),
        fetch(`https://api.github.com/users/${login}/repos?sort=stars&per_page=6`, { headers }),
      ]);

      if (!userRes.ok) return null;

      const user = (await userRes.json()) as GitHubUser;
      const repos = reposRes.ok ? ((await reposRes.json()) as GitHubRepo[]) : [];

      // Extract top languages from repos
      const langCounts: Record<string, number> = {};
      for (const repo of repos) {
        if (repo.language) {
          langCounts[repo.language] = (langCounts[repo.language] || 0) + repo.stargazers_count + 1;
        }
      }
      const topLanguages = Object.entries(langCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([lang]) => lang);

      const topRepos = repos.slice(0, 4).map((r) => ({
        name: r.name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        forks: r.forks_count,
        url: r.html_url,
      }));

      return {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url,
        htmlUrl: user.html_url,
        bio: user.bio,
        company: user.company,
        location: user.location,
        publicRepos: user.public_repos,
        followers: user.followers,
        following: user.following,
        blog: user.blog,
        createdAt: user.created_at,
        topLanguages,
        topRepos,
      };
    } catch (err) {
      console.warn(`[SearchGitHubTalent] Failed to fetch profile for ${login}:`, err);
      return null;
    }
  }
}
