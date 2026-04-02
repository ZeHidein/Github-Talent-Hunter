/**
 * GitHub Token Router
 *
 * Manages GitHub Personal Access Tokens per session.
 * Tokens are stored in a server-side Map — never exposed to LLM context.
 */
import { z } from 'zod';
import { createRouter, publicProcedure } from '../init';
import { loggedProcedure } from '../middleware/action-logging';

// Server-side token cache keyed by session
const tokenCache = new Map<string, string>();

/** Retrieve a stored GitHub token for the given session */
export function getGitHubToken(sessionKey: string): string | undefined {
  return tokenCache.get(sessionKey);
}

export function createGitHubTokenRouter() {
  return createRouter({
    /** Check whether a token is configured (returns boolean, never the token itself) */
    status: publicProcedure.query(({ ctx }) => {
      const hasToken = tokenCache.has(ctx.sessionKey);
      return { configured: hasToken };
    }),

    /** Save a GitHub token (securely, server-side only) */
    save: loggedProcedure
      .input(z.object({ token: z.string().min(1) }))
      .mutation(({ input, ctx }) => {
        tokenCache.set(ctx.sessionKey, input.token);
        // IMPORTANT: do NOT log the token value
        return {
          success: true,
          logSummary: 'GitHub Token 已配置',
          invalidateTopics: ['githubToken'],
        };
      }),

    /** Remove the stored token */
    remove: loggedProcedure.mutation(({ ctx }) => {
      tokenCache.delete(ctx.sessionKey);
      return {
        success: true,
        logSummary: 'GitHub Token 已移除',
        invalidateTopics: ['githubToken'],
      };
    }),
  });
}
