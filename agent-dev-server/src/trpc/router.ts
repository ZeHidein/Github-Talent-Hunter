import { createRouter } from './init';
import type { createPlatformRouter } from './routers/platform.router';
import { createGitHubTokenRouter } from './routers/github-token.router';
import { createKeywordsRouter } from './routers/keywords.router';

export function createAppRouter(platformRouter: ReturnType<typeof createPlatformRouter>) {
  return createRouter({
    platform: platformRouter,
    githubToken: createGitHubTokenRouter(),
    keywords: createKeywordsRouter(),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
