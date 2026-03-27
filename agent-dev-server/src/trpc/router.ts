import { createRouter } from './init';
import type { createPlatformRouter } from './routers/platform.router';

export function createAppRouter(platformRouter: ReturnType<typeof createPlatformRouter>) {
  return createRouter({
    platform: platformRouter,
    // Builder adds routers here:
    // drafts: draftsRouter,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
