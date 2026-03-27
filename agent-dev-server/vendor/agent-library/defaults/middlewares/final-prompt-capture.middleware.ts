import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';
import type {
  KernelModelMiddleware,
  KernelModelMiddlewareContext,
} from '../../kernel/middlewares/types.ts';

/**
 * Captures the final prompt after ALL prompt-shaping middlewares have run, right before the model call.
 *
 * This is the source of truth for "what we finally posted to the model".
 */
export class FinalPromptCaptureMiddleware implements KernelModelMiddleware {
  create(ctx: KernelModelMiddlewareContext): LanguageModelMiddleware {
    return {
      specificationVersion: 'v3',
      transformParams: async ({ params }) => {
        const opts = params as LanguageModelV3CallOptions;
        ctx.state.setLastFinalPrompt?.(opts.prompt);
        return opts;
      },
    };
  }
}
