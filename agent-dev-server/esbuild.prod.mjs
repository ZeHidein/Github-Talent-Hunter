import * as esbuild from 'esbuild';

import { ctxConfig } from './esbuild.base.mjs';

const run = async () => {
  try {
    await esbuild.build({
      ...ctxConfig,
    });

    console.log('✅ Server production build complete: ./build/main.js');
  } catch (error) {
    console.error('❌ Server production build failed:', error);
    process.exit(1);
  }
};

run();
