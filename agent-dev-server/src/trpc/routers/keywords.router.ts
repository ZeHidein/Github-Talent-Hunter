/**
 * Keywords Router
 *
 * Manages keywords extracted during company diagnosis conversations.
 * Keywords are stored server-side per session and displayed in the sidebar.
 * The sidebar component reads via useLiveQuery; the agent writes via saveKeywords tool.
 */
import { z } from 'zod';
import { createRouter, publicProcedure } from '../init';
import { loggedProcedure } from '../middleware/action-logging';

export interface Keyword {
  id: string;
  text: string;
  category: string;
  checked: boolean;
}

// Server-side keyword store keyed by session
const keywordStore = new Map<string, Keyword[]>();

/** Get keywords for a session (used by backend tools) */
export function getKeywords(sessionKey: string): Keyword[] {
  return keywordStore.get(sessionKey) ?? [];
}

/** Add keywords for a session (used by backend tools) */
export function addKeywords(sessionKey: string, keywords: Array<{ text: string; category: string }>): Keyword[] {
  const existing = keywordStore.get(sessionKey) ?? [];

  const newKeywords: Keyword[] = [];
  for (const kw of keywords) {
    // Deduplicate by text (case-insensitive)
    const exists = existing.some((e) => e.text.toLowerCase() === kw.text.toLowerCase());
    if (!exists) {
      newKeywords.push({
        id: crypto.randomUUID(),
        text: kw.text,
        category: kw.category,
        checked: true, // enabled by default
      });
    }
  }

  const updated = [...existing, ...newKeywords];
  keywordStore.set(sessionKey, updated);
  return updated;
}

export function createKeywordsRouter() {
  return createRouter({
    /** List all keywords for current session */
    list: publicProcedure.query(({ ctx }) => {
      return getKeywords(ctx.sessionKey);
    }),

    /** Toggle a keyword's checked state */
    toggle: loggedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => {
        const keywords = keywordStore.get(ctx.sessionKey) ?? [];
        const kw = keywords.find((k) => k.id === input.id);
        if (kw) {
          kw.checked = !kw.checked;
          keywordStore.set(ctx.sessionKey, keywords);
          return {
            success: true,
            logSummary: `关键词「${kw.text}」${kw.checked ? '已启用' : '已禁用'}`,
          };
        }
        return { success: false, logSummary: 'Keyword not found' };
      }),

    /** Remove a keyword */
    remove: loggedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => {
        const keywords = keywordStore.get(ctx.sessionKey) ?? [];
        const kw = keywords.find((k) => k.id === input.id);
        const filtered = keywords.filter((k) => k.id !== input.id);
        keywordStore.set(ctx.sessionKey, filtered);
        return {
          success: true,
          logSummary: kw ? `移除关键词「${kw.text}」` : 'Keyword removed',
        };
      }),

    /** Clear all keywords */
    clear: loggedProcedure.mutation(({ ctx }) => {
      keywordStore.delete(ctx.sessionKey);
      return { success: true, logSummary: '已清除所有关键词' };
    }),
  });
}
