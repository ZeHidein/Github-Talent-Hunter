import type { LanguageModelV3 } from '@ai-sdk/provider';
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import type { KernelModelMiddleware, KernelModelMiddlewareContext } from './types.ts';

export function wrapModelWithKernelMiddlewares(params: {
  model: LanguageModelV3;
  ctx: KernelModelMiddlewareContext;
  middlewares: KernelModelMiddleware[];
}): LanguageModelV3 {
  const collected: LanguageModelMiddleware[] = [];
  for (const mw of params.middlewares) {
    const created = mw.create(params.ctx);
    if (!created) {
      continue;
    }
    if (Array.isArray(created)) {
      collected.push(...created);
    } else {
      collected.push(created);
    }
  }

  if (collected.length === 0) {
    return params.model;
  }
  if (collected.length === 1) {
    return wrapLanguageModel({ model: params.model, middleware: collected[0] });
  }
  return wrapLanguageModel({ model: params.model, middleware: collected });
}
