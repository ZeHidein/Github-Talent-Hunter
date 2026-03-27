import { publicProcedure, middleware } from '../init';

/**
 * tRPC middleware that automatically logs mutations to the ActionLog.
 *
 * Mutations should return { logSummary: string, logData?: Record<string, unknown> }
 * for descriptive logging. If logSummary is absent, falls back to the procedure path.
 *
 * logSummary and logData are stripped from the response — clients never see them.
 */
const actionLogging = middleware(async ({ next, path, type, ctx }) => {
  const result = await next();

  if (type === 'mutation' && result.ok) {
    const data = result.data;

    // Only process if data is a plain object (not primitive, array, or null)
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;
      const summary = (record.logSummary as string) ?? `Executed ${path}`;

      ctx.actionLog.append({
        action: path,
        summary,
        data: record.logData as Record<string, unknown> | undefined,
      });

      // Auto-invalidation: broadcast invalidation signal to session clients
      const routerName = path.split('.')[0];
      const invalidateTopics = record.invalidateTopics as string[] | false | undefined;

      if (invalidateTopics !== false) {
        const topics = Array.isArray(invalidateTopics) ? invalidateTopics : [routerName];
        for (const topic of topics) {
          ctx.invalidate(topic);
        }
      }

      // Strip internal fields from response — don't leak to client
      delete record.logSummary;
      delete record.logData;
      delete record.invalidateTopics;
    }
  }

  return result;
});

export const loggedProcedure = publicProcedure.use(actionLogging);
