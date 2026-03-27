import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';
import type {
  KernelModelMiddleware,
  KernelModelMiddlewareContext,
} from '../../kernel/middlewares/types.ts';
import { limitPromptByTurns } from './prompt-utils.ts';

/**
 * Trims the model prompt to the last N turns based on `state.getTurnsLimit()`.
 * This keeps "turnsLimit" terminology in the middleware layer (instead of a message-builder).
 */
export class TurnsLimitMiddleware implements KernelModelMiddleware {
  create(ctx: KernelModelMiddlewareContext): LanguageModelMiddleware | null {
    const limit = ctx.state.getTurnsLimit?.();
    if (!limit) {
      return null;
    }
    return {
      specificationVersion: 'v3',
      transformParams: async ({ params }) => {
        const opts = params as LanguageModelV3CallOptions;
        return { ...opts, prompt: limitPromptByTurns(opts.prompt, limit) };
      },
    };
  }
}
